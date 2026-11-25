import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import type { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';
import handler from '../pages/api/sendMessage';
import { contactConfig, contactMail } from '../lib/contact-server';
import { CONTACT_EMAIL } from '../lib/site';
import {
  CONTACT_SEND_ERROR,
  CONTACT_UNAVAILABLE,
  contactEmailLink,
  parseContactMessage,
} from '../lib/contact';

const draft = {
  name: 'Visitor',
  email: 'visitor@example.com',
  message: 'A research question.',
};
const configured = {
  USER_EMAIL: 'sender@example.com',
  GMAIL_APP_PASSWORD: 'test-only-app-password',
  RECIPIENT_EMAIL: CONTACT_EMAIL,
};

async function request(method: string, body: unknown = draft) {
  const result = {
    status: 200,
    body: {} as Record<string, unknown>,
    headers: {} as Record<string, unknown>,
  };
  const res = {
    setHeader(name: string, value: unknown) {
      result.headers[name] = value;
    },
    status(code: number) {
      result.status = code;
      return this;
    },
    json(data: Record<string, unknown>) {
      result.body = data;
      return this;
    },
  };
  await handler(
    { method, body } as NextApiRequest,
    res as unknown as NextApiResponse
  );
  return result;
}

async function withMailEnv(
  values: Record<string, string>,
  run: () => Promise<void>
) {
  const names = Object.keys(configured);
  const saved = names.map((key) => process.env[key]);
  for (const key of names) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    await run();
  } finally {
    names.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
    mock.restoreAll();
  }
}

test('contact validation rejects malformed fields, header injection, and excessive input', () => {
  assert.deepEqual(
    parseContactMessage({
      name: ' Visitor ',
      email: ' visitor@example.com ',
      message: ' Hello\nworld ',
    }),
    { ...draft, message: 'Hello\nworld' }
  );
  for (const input of [
    null,
    [],
    'text',
    { ...draft, email: [] },
    { ...draft, name: 'A\r\nBcc: other@example.com' },
    { ...draft, email: 'bad@example.com\nBcc:x@y.com' },
    { ...draft, email: 'invalid' },
    { ...draft, name: ' '.repeat(10) },
    { ...draft, name: 'a'.repeat(101) },
    { ...draft, message: 'x'.repeat(5001) },
    { ...draft, message: 'a\x00b' },
  ]) {
    assert.equal(parseContactMessage(input), null);
  }
});

test('contact config normalizes app passwords and defaults the recipient', () => {
  assert.equal(contactConfig({} as NodeJS.ProcessEnv), null);
  assert.equal(
    contactConfig({ ...configured, GMAIL_APP_PASSWORD: '  ' }),
    null
  );
  assert.equal(contactConfig({ ...configured, RECIPIENT_EMAIL: 'bad' }), null);
  assert.deepEqual(
    contactConfig({
      ...configured,
      GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
      RECIPIENT_EMAIL: '',
    }),
    {
      sender: configured.USER_EMAIL,
      password: 'abcdefghijklmnop',
      recipient: CONTACT_EMAIL,
    }
  );
});

test('mail uses authenticated sender and visitor reply address; fallback encodes the draft', () => {
  const message = contactMail(contactConfig(configured)!, draft);
  assert.equal(message.from.address, configured.USER_EMAIL);
  assert.equal(message.replyTo.address, draft.email);
  assert.equal(message.to, CONTACT_EMAIL);
  const link = new URL(
    contactEmailLink({ ...draft, message: 'A & B?\n#research' })
  );
  assert.equal(link.protocol, 'mailto:');
  assert.equal(link.pathname, CONTACT_EMAIL);
  assert.match(link.searchParams.get('body')!, /A & B\?\n#research/);
  assert.match(
    link.searchParams.get('body')!,
    /Reply email: visitor@example.com/
  );
});

test('unconfigured contact route exposes only readiness and never opens SMTP', async () => {
  await withMailEnv({}, async () => {
    const transport = mock.method(nodemailer, 'createTransport', () => {
      throw new Error('SMTP must not be called');
    });
    const get = await request('GET');
    assert.deepEqual(get.body, { available: false });
    assert.match(String(get.headers['Cache-Control']), /no-store/);
    const post = await request('POST');
    assert.equal(post.status, 503);
    assert.deepEqual(post.body, { error: CONTACT_UNAVAILABLE });
    assert.equal(transport.mock.callCount(), 0);
  });
});

test('configured route validates before SMTP and delivers with safe headers', async () => {
  await withMailEnv(configured, async () => {
    let delivered: unknown;
    let options: unknown;
    let closed = false;
    const transport = mock.method(
      nodemailer,
      'createTransport',
      (input: unknown) => {
        options = input;
        return {
          sendMail: async (mail: unknown) => {
            delivered = mail;
            return { accepted: [CONTACT_EMAIL] };
          },
          close: () => {
            closed = true;
          },
        } as never;
      }
    );
    assert.deepEqual((await request('GET')).body, { available: true });
    assert.equal((await request('POST', { ...draft, email: {} })).status, 400);
    assert.equal((await request('PUT')).status, 405);
    assert.equal(transport.mock.callCount(), 0);
    const post = await request('POST');
    assert.equal(post.status, 200);
    assert.equal(typeof post.body.success, 'string');
    assert.deepEqual(delivered, contactMail(contactConfig(configured)!, draft));
    assert.deepEqual(options, {
      service: 'gmail',
      auth: {
        user: configured.USER_EMAIL,
        pass: configured.GMAIL_APP_PASSWORD,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    assert.equal(closed, true);
  });
});

test('SMTP failure preserves a safe response and logs only diagnostic codes', async () => {
  await withMailEnv(configured, async () => {
    let closed = false;
    const log = mock.method(console, 'error', () => {});
    mock.method(
      nodemailer,
      'createTransport',
      () =>
        ({
          sendMail: async () => {
            throw Object.assign(new Error('secret server response'), {
              code: 'EAUTH',
              responseCode: 535,
              response: configured.GMAIL_APP_PASSWORD,
            });
          },
          close: () => {
            closed = true;
          },
        }) as never
    );
    const post = await request('POST');
    assert.equal(post.status, 503);
    assert.deepEqual(post.body, { error: CONTACT_SEND_ERROR });
    assert.deepEqual(log.mock.calls[0].arguments, [
      'Contact email delivery failed',
      { code: 'EAUTH', responseCode: 535 },
    ]);
    assert.equal(closed, true);
  });
});

test('an unaccepted recipient cannot be reported as a successful send', async () => {
  await withMailEnv(configured, async () => {
    mock.method(console, 'error', () => {});
    mock.method(
      nodemailer,
      'createTransport',
      () => ({ sendMail: async () => ({ accepted: [] }), close() {} }) as never
    );
    assert.equal((await request('POST')).status, 503);
  });
});

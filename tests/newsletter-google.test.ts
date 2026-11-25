import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, createHmac, randomUUID } from 'node:crypto';

// Runs the real Apps Script source against in-memory Google service doubles.
// MailApp below captures messages only. No test contacts Google or sends email.
function harness() {
  const secret = 'transport_' + 'a'.repeat(64), origin = 'https://prameshsharma.com';
  const properties: Record<string, string> = { SHARED_SECRET: secret, PUBLIC_SITE_URL: origin, SENDER_POSTAL_ADDRESS: 'Test address, Example City' };
  const messages: { to: string; subject: string; body: string; htmlBody: string }[] = [];
  let clock = Date.parse('2026-11-24T12:00:00Z'), quota = 100, ambiguous = false, busy = false, crashAfterAudience = false;
  class Sheet {
    rows: unknown[][] = [];
    constructor(public name: string) {}
    getLastRow() { return this.rows.length; }
    appendRow(row: unknown[]) { this.rows.push([...row]); }
    setFrozenRows() {}
    deleteRow(row: number) { this.rows.splice(row - 1, 1); }
    getRange(row: number, column: number, count: number, width: number) {
      return {
        getValues: () => Array.from({ length: count }, (_, i) => Array.from({ length: width }, (_, j) => this.rows[row - 1 + i]?.[column - 1 + j] ?? '')),
        setValues: (values: unknown[][]) => {
          values.forEach((cells, i) => { const dest = this.rows[row - 1 + i] ||= []; cells.forEach((value, j) => { dest[column - 1 + j] = value; }); });
          if (this.name === 'Deliveries' && crashAfterAudience) { crashAfterAudience = false; throw new Error('Simulated response lost after saving audience'); }
        },
      };
    }
  }
  const sheets: Record<string, Sheet> = {};
  const book = { getId: () => 'private-test-sheet', getSheetByName: (name: string) => sheets[name], insertSheet: (name: string) => sheets[name] = new Sheet(name) };
  class Clock extends Date { constructor(value?: string | number) { super(value === undefined ? clock : value); } static now() { return clock; } }
  const context = vm.createContext({
    Date: Clock, console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => properties[key] || null, setProperty: (key: string, value: string) => { properties[key] = value; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => book, create: () => book, openById: () => book, flush: () => {} },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    Utilities: { getUuid: randomUUID, DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_: unknown, value: string) => createHash('sha256').update(value).digest(), computeHmacSha256Signature: (value: string, key: string) => createHmac('sha256', key).update(value).digest(), base64EncodeWebSafe: (value: Uint8Array) => Buffer.from(value).toString('base64url') },
    MailApp: { getRemainingDailyQuota: () => quota, sendEmail: (mail: typeof messages[number]) => { messages.push(mail); quota--; if (ambiguous) { ambiguous = false; throw new Error('Simulated ambiguous result'); } } },
    LockService: { getScriptLock: () => { let acquired = false; return { tryLock: () => acquired = !busy, hasLock: () => acquired, releaseLock: () => { acquired = false; } }; } },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
  });
  vm.runInContext(fs.readFileSync('integrations/google-newsletter/Code.gs', 'utf8'), context);
  context.setupNewsletter();
  const call = (action: string, payload: Record<string, unknown> = {}, override = {}) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ action, payload, secret, origin, ...override }) } }).text);
  const records = (name: string) => sheets[name].rows.slice(1).map(row => JSON.parse(String(row[3])));
  const subscribe = (email = 'reader@example.com', ipHash = createHash('sha256').update(email).digest('hex')) => call('subscribe', { email, ipHash, source: 'test' });
  const token = () => messages[messages.length - 1].body.match(/#token=([A-Za-z0-9_-]+)/)![1];
  const confirmed = (email = 'reader@example.com') => { assert.equal(subscribe(email).ok, true); assert.equal(call('confirm', { token: token() }).ok, true); };
  const draft = () => { const id = randomUUID(); assert.equal(call('saveDraft', { id, subject: 'Research update', body: 'Here is the new post.', articleUrl: origin + '/posts/example' }).ok, true); return id; };
  return { call, records, subscribe, token, confirmed, draft, messages, properties, sheets, advance: (ms: number) => { clock += ms; }, setQuota: (n: number) => { quota = n; }, ambiguousNext: () => { ambiguous = true; }, setBusy: (value: boolean) => { busy = value; }, crashAudience: () => { crashAfterAudience = true; } };
}

test('script setup sends nothing, rejects unauthorized requests, and serializes operations', () => {
  const h = harness(); assert.equal(h.messages.length, 0);
  assert.equal(h.call('overview', {}, { secret: 'wrong' }).error, 'unauthorized');
  assert.equal(h.call('overview', {}, { origin: 'https://evil.test' }).error, 'unauthorized');
  assert.equal(h.call('constructor').error, 'invalid');
  h.setBusy(true); assert.equal(h.call('overview').error, 'busy');
});
test('signup requires confirmation, stores hashed tokens, and handles duplicates', () => {
  const h = harness(); assert.equal(h.subscribe().ok, true);
  assert.equal(h.records('Subscribers')[0].status, 'pending');
  const token = h.token(); assert.ok(!JSON.stringify(h.records('Subscribers')).includes(token));
  assert.equal(h.subscribe().ok, true); assert.equal(h.messages.length, 1);
  assert.equal(h.call('confirm', { token }).ok, true); assert.equal(h.call('confirm', { token }).ok, true);
  assert.equal(h.records('Subscribers')[0].status, 'confirmed');
  h.subscribe(); assert.equal(h.messages.length, 1);
});
test('confirmation expires and a new request can replace it without enrolling automatically', () => {
  const h = harness(); h.subscribe(); const old = h.token(); h.advance(49 * 3600000);
  assert.equal(h.call('confirm', { token: old }).error, 'token');
  assert.equal(h.subscribe().ok, true); const fresh = h.token();
  assert.notEqual(fresh, old); assert.equal(h.call('confirm', { token: old }).error, 'token');
  assert.equal(h.call('confirm', { token: fresh }).ok, true);
});
test('newsletter approval snapshots confirmed subscribers and sending resumes without duplicates', () => {
  const h = harness(); for (let i = 0; i < 7; i++) h.confirmed(`reader${i}@example.com`);
  h.subscribe('pending@example.com'); const id = h.draft();
  assert.equal(h.call('approveCampaign', { id }).ok, true); h.call('approveCampaign', { id });
  assert.equal(h.records('Deliveries').length, 7);
  h.call('sendBatch', { id }); assert.equal(h.records('Deliveries').filter(r => r.status === 'sent').length, 5);
  h.call('sendBatch', { id }); h.call('sendBatch', { id });
  const sends = h.messages.filter(m => m.subject === 'Research update'); assert.equal(sends.length, 7);
  assert.ok(sends.every(m => m.to !== 'pending@example.com' && !m.to.includes(',')));
  assert.equal(h.call('overview').result.campaigns[0].status, 'complete');
});
test('audience save recovery is idempotent after a lost response', () => {
  const h = harness(); h.confirmed(); const id = h.draft(); h.crashAudience();
  assert.equal(h.call('approveCampaign', { id }).ok, false);
  assert.equal(h.records('Campaigns')[0].status, 'preparing');
  assert.equal(h.call('approveCampaign', { id }).ok, true); assert.equal(h.records('Deliveries').length, 1);
});
test('unsubscribe is idempotent and suppresses queued mail, including after re-subscription', () => {
  const h = harness(); h.confirmed(); const first = h.draft(); h.call('approveCampaign', { id: first }); h.call('sendBatch', { id: first });
  const unsubscribe = h.token(); const second = h.draft(); h.call('approveCampaign', { id: second });
  assert.equal(h.call('unsubscribe', { token: unsubscribe }).ok, true); assert.equal(h.call('unsubscribe', { token: unsubscribe }).ok, true);
  h.advance(2 * 3600000); h.confirmed(); h.call('sendBatch', { id: second });
  assert.equal(h.records('Deliveries').find(r => r.campaignId === second).status, 'skipped');
  assert.equal(h.messages.filter(m => m.subject === 'Research update').length, 1);
});
test('quota pauses a batch and reserves capacity for confirmations', () => {
  const h = harness(); h.confirmed(); const id = h.draft(); h.call('approveCampaign', { id });
  h.setQuota(5); h.call('sendBatch', { id }); assert.equal(h.records('Deliveries')[0].status, 'queued');
  h.setQuota(10); h.call('sendBatch', { id }); assert.equal(h.records('Deliveries')[0].status, 'sent');
});
test('owner can suppress bounced addresses without sending or editing spreadsheet records', () => {
  const h = harness(); h.confirmed('bounce@example.com'); const id = h.draft(); h.call('approveCampaign', { id });
  assert.equal(h.call('suppressSubscriber', { email: 'bounce@example.com' }).ok, true);
  assert.equal(h.call('suppressSubscriber', { email: 'missing@example.com' }).ok, true);
  h.call('sendBatch', { id });
  assert.equal(h.records('Deliveries')[0].status, 'skipped');
  assert.equal(h.messages.filter(m => m.subject === 'Research update').length, 0);
});
test('ambiguous sends are marked for review and never automatically resent', () => {
  const h = harness(); h.confirmed(); const id = h.draft(); h.call('approveCampaign', { id }); h.ambiguousNext();
  h.call('sendBatch', { id }); h.call('sendBatch', { id });
  assert.equal(h.messages.filter(m => m.subject === 'Research update').length, 1);
  assert.equal(h.call('overview').result.campaigns[0].uncertain, 1);
  assert.equal(h.call('overview').result.campaigns[0].status, 'review');
});
test('preview goes only to the owner, HTML is escaped, and recipients cannot be injected', () => {
  const h = harness(), id = h.draft();
  h.call('saveDraft', { id, subject: '=SUM(1,1)', body: '<script>alert(1)</script>', articleUrl: '' });
  assert.ok(String(h.sheets.Campaigns.rows[1][1]).startsWith("'="));
  assert.equal(h.call('sendTest', { id, to: 'attacker@example.com' }).ok, true);
  const mail = h.messages[0]; assert.equal(mail.to, 'owner@example.com'); assert.ok(!mail.htmlBody.includes('<script>')); assert.ok(mail.htmlBody.includes('&lt;script&gt;'));
  assert.equal(h.call('saveDraft', { id, subject: 'bad\r\nBcc: x@example.com', body: 'test' }).error, 'invalid');
  assert.equal(h.call('saveDraft', { id, subject: 'test', body: 'test', articleUrl: 'https://prameshsharma.com.evil.test/x' }).error, 'invalid');
});
test('abuse limits, sender footer, and cancellation prevent unintended sends', () => {
  const h = harness(), ip = 'a'.repeat(64);
  for (let i = 0; i < 5; i++) assert.equal(h.subscribe(`reader${i}@example.com`, ip).ok, true);
  assert.equal(h.subscribe('reader6@example.com', ip).error, 'rate');
  h.confirmed('confirmed@example.com'); const id = h.draft(); h.properties.SENDER_POSTAL_ADDRESS = '';
  assert.equal(h.call('approveCampaign', { id }).error, 'footer'); h.properties.SENDER_POSTAL_ADDRESS = 'Test address';
  h.call('approveCampaign', { id }); h.call('cancelCampaign', { id }); h.call('sendBatch', { id });
  assert.equal(h.messages.filter(m => m.subject === 'Research update').length, 0);
});

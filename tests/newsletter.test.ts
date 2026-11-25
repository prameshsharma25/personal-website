import test from 'node:test';
import assert from 'node:assert/strict';
import { newsletterSignupUrl } from '../lib/newsletter';

test('missing or unsafe signup destinations do not produce a live signup link', () => {
  for (const url of [undefined, '', '   ', '/subscribe', 'javascript:alert(1)', 'http://example.com/form', 'https://user:password@example.com/form']) {
    assert.equal(newsletterSignupUrl(url), null);
  }
});

test('hosted signup forms support different providers and custom domains', () => {
  for (const url of ['https://example.kit.com/newsletter', 'https://example.mailerpage.io/subscribe', 'https://newsletter.example.org/signup?source=website']) {
    assert.equal(newsletterSignupUrl(url), url);
  }
});

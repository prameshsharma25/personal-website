import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gumroadProductUrl } from '../lib/gumroad';
import { getGuideBySlug } from '../lib/guides';

test('published Gumroad products work without environment configuration', () => {
  assert.equal(gumroadProductUrl('phd-essays', {}), 'https://pramesh6.gumroad.com/l/phd-application-essays');
  assert.equal(gumroadProductUrl('uc-annotations', {}), 'https://pramesh6.gumroad.com/l/uc-essay-annotations');
});

test('Gumroad links can be paused and overrides must belong to the seller', () => {
  const env = {
    GUMROAD_SALES_ENABLED: 'true',
    UC_ANNOTATIONS_GUMROAD_URL: 'https://pramesh6.gumroad.com/l/uc-essay-annotations',
    PHD_ESSAYS_GUMROAD_URL: 'https://pramesh6.gumroad.com/l/phd-application-essays',
  };
  assert.equal(gumroadProductUrl('uc-annotations', env), env.UC_ANNOTATIONS_GUMROAD_URL);
  assert.equal(gumroadProductUrl('phd-essays', env), env.PHD_ESSAYS_GUMROAD_URL);
  assert.equal(gumroadProductUrl('uc-annotations', { ...env, GUMROAD_SALES_ENABLED: 'false' }), null);
  assert.equal(gumroadProductUrl('uc-annotations', { ...env, UC_ANNOTATIONS_GUMROAD_URL: '' }), null);
  for (const value of [
    'http://pramesh6.gumroad.com/l/uc-essay-annotations',
    'https://gumroad.com/products/rzmra/edit',
    'https://pramesh6.gumroad.com.evil.example/l/uc',
    'https://other.gumroad.com/l/uc',
    'https://name:password@pramesh6.gumroad.com/l/uc',
    'https://pramesh6.gumroad.com:8080/l/uc',
    'https://pramesh6.gumroad.com/l/uc?next=https://example.com',
    'https://pramesh6.gumroad.com/l/uc#license',
    'https://pramesh6.gumroad.com/l/uc/extra',
    'javascript:alert(1)',
  ]) assert.equal(gumroadProductUrl('uc-annotations', { ...env, UC_ANNOTATIONS_GUMROAD_URL: value }), null, value);
});

test('the public UC guide preserves the complete free essay without paid commentary', () => {
  const guide = getGuideBySlug('college-essay');
  // Protect the free text, including the approved change from a dash to a comma,
  // without copying private commentary into Git.
  const digest = createHash('sha256').update(guide.content.trim()).digest('hex');
  assert.equal(digest, '15b3d66e2b29f59c643dc36322ef4b69f71ff7991d5fd48bbc5a8c9465812283');
});

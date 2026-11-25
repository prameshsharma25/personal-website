import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gumroadProductUrl } from '../lib/gumroad';
import { getGuideBySlug } from '../lib/guides';

test('Gumroad products stay unavailable until enabled with their own valid URL', () => {
  const env = {
    GUMROAD_SALES_ENABLED: 'true',
    UC_ANNOTATIONS_GUMROAD_URL: 'https://pramesh6.gumroad.com/l/uc-essay-annotations',
    PHD_ESSAYS_GUMROAD_URL: 'https://pramesh6.gumroad.com/l/rzmra',
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
  // A digest protects the exact free text without copying private commentary into Git.
  const digest = createHash('sha256').update(guide.content.trim()).digest('hex');
  assert.equal(digest, 'abc625548411cce328265213d1b52d4eb31432aec481e57c9b080bf6f1c8d11f');
});

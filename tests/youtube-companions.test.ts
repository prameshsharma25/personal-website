import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chapterEmbedUrl,
  chapterShareUrl,
  chapterTime,
  videoCompanion,
} from '../lib/youtube-companions';

test('chapter configuration stays within the video and unrelated uploads never inherit it', () => {
  const companion = videoCompanion('oDGqUMBvrpY')!;
  assert.ok(companion.durationSeconds > 0);
  assert.equal(companion.chapters[0].start, 0);
  for (let i = 0; i < companion.chapters.length; i++) {
    const chapter = companion.chapters[i];
    assert.ok(
      Number.isInteger(chapter.start) &&
        chapter.start >= 0 &&
        chapter.start < companion.durationSeconds
    );
    assert.ok(chapter.title.trim());
    if (i > 0) assert.ok(chapter.start > companion.chapters[i - 1].start);
  }
  assert.equal(videoCompanion('future12345'), null);
  assert.equal(videoCompanion('__proto__'), null);
  assert.equal(videoCompanion('constructor'), null);
});

test('chapter links preserve exact timestamps and use the intended YouTube hosts', () => {
  const embed = new URL(chapterEmbedUrl('oDGqUMBvrpY', 37));
  assert.equal(embed.origin, 'https://www.youtube-nocookie.com');
  assert.equal(embed.pathname, '/embed/oDGqUMBvrpY');
  assert.equal(embed.searchParams.get('start'), '37');
  assert.equal(embed.searchParams.get('autoplay'), '1');
  assert.equal(embed.searchParams.get('playsinline'), '1');
  assert.equal(
    chapterShareUrl('oDGqUMBvrpY', 37),
    'https://www.youtube.com/watch?v=oDGqUMBvrpY&t=37s'
  );
  assert.equal(
    new URL(chapterEmbedUrl('oDGqUMBvrpY', 0)).searchParams.get('start'),
    '0'
  );
  for (const start of [-1, 1.5, Number.NaN, Infinity]) {
    assert.throws(() => chapterShareUrl('oDGqUMBvrpY', start));
    assert.throws(() => chapterEmbedUrl('oDGqUMBvrpY', start));
  }
  assert.throws(() => chapterEmbedUrl('https://example.com', 0));
});

test('chapter timestamps remain readable across minute and hour boundaries', () => {
  assert.equal(chapterTime(0), '0:00');
  assert.equal(chapterTime(7), '0:07');
  assert.equal(chapterTime(76), '1:16');
  assert.equal(chapterTime(3671), '1:01:11');
});

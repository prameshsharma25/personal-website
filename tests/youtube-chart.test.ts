import assert from 'node:assert/strict';
import test from 'node:test';
import { peakViewDay, viewDays, viewsCsv } from '../lib/youtube-chart';

test('chart dates distinguish reported zeroes from missing days and sum only in-range measurements', () => {
  const days = viewDays(
    [
      { date: '2026-11-25', views: 7 },
      { date: '2026-11-22', views: 5 },
      { date: '2026-11-24', views: 0 },
      { date: '2026-11-21', views: 1000 },
      { date: '2026-11-26', views: 1000 },
    ],
    '2026-11-22',
    '2026-11-25'
  );
  assert.deepEqual(days, [
    { date: '2026-11-22', views: 5, cumulative: 5 },
    { date: '2026-11-23', views: null, cumulative: null },
    { date: '2026-11-24', views: 0, cumulative: 5 },
    { date: '2026-11-25', views: 7, cumulative: 12 },
  ]);
  assert.equal(peakViewDay(days), 3);
  assert.equal(
    viewsCsv('oDGqUMBvrpY', days),
    'video_id,date,views,cumulative_reported_views\r\n' +
      '"oDGqUMBvrpY","2026-11-22","5","5"\r\n' +
      '"oDGqUMBvrpY","2026-11-24","0","5"\r\n' +
      '"oDGqUMBvrpY","2026-11-25","7","12"\r\n'
  );
});

test('peak selection handles tied counts, all zeroes, and unavailable measurements', () => {
  const days = viewDays(
    [
      { date: '2026-11-22', views: 0 },
      { date: '2026-11-24', views: 0 },
      { date: '2026-11-23', views: Number.NaN },
    ],
    '2026-11-22',
    '2026-11-24'
  );
  assert.equal(peakViewDay(days), 0);
  assert.equal(peakViewDay(viewDays([], '2026-11-22', '2026-11-24')), -1);
  assert.deepEqual(viewDays([], 'bad-date', '2026-11-24'), []);
  assert.deepEqual(viewDays([], '2026-11-24', '2026-11-22'), []);
});

test('daily calendar and cumulative totals remain stable across month and daylight saving boundaries', () => {
  const days = viewDays(
    [
      { date: '2026-10-31', views: 2 },
      { date: '2026-11-01', views: 4 },
    ],
    '2026-10-31',
    '2026-11-02'
  );
  assert.deepEqual(
    days.map((day) => [day.date, day.cumulative]),
    [
      ['2026-10-31', 2],
      ['2026-11-01', 6],
      ['2026-11-02', null],
    ]
  );
});

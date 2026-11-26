import type { YouTubeAnalytics } from './youtube';

export type ViewDay = {
  date: string;
  views: number | null;
  cumulative: number | null;
};

const DAY = 86400000;

export function viewDays(
  daily: NonNullable<YouTubeAnalytics['daily']>,
  startDate: string,
  endDate: string
): ViewDay[] {
  const start = Date.parse(startDate + 'T00:00:00Z');
  const length = (Date.parse(endDate + 'T00:00:00Z') - start) / DAY + 1;
  if (!Number.isInteger(length) || length < 1 || length > 366) return [];
  const counts = new Map(
    daily
      .filter((point) => Number.isFinite(point.views) && point.views >= 0)
      .map((point) => [point.date, point.views])
  );
  let total = 0;
  return Array.from({ length }, (_, index) => {
    const date = new Date(start + index * DAY).toISOString().slice(0, 10);
    const views = counts.get(date) ?? null;
    if (views !== null) total += views;
    return { date, views, cumulative: views === null ? null : total };
  });
}

export function peakViewDay(points: ViewDay[]): number {
  return points.reduce(
    (peak, point, index) =>
      point.views !== null &&
      (peak < 0 || point.views > (points[peak].views ?? 0))
        ? index
        : peak,
    -1
  );
}

export function viewsCsv(videoId: string, points: ViewDay[]): string {
  const cell = (value: string | number) =>
    '"' + String(value).replaceAll('"', '""') + '"';
  return (
    [
      'video_id,date,views,cumulative_reported_views',
      ...points
        .filter((point) => point.views !== null)
        .map((point) =>
          [videoId, point.date, point.views!, point.cumulative!]
            .map(cell)
            .join(',')
        ),
    ].join('\r\n') + '\r\n'
  );
}

export const YOUTUBE_CHANNEL_ID = 'UC8ULgisbWvZlqcn6ZnI0bPA';
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@prameshsharma2343';
export type YouTubeVideo = {
  id: string;
  title: string;
  publishedAt: string;
  views: number | null;
};
export type YouTubeFeed = {
  videos: YouTubeVideo[];
  checkedAt: string | null;
  status: 'fresh' | 'stale' | 'unavailable';
};
export type YouTubeAnalytics = {
  status: 'available' | 'not_connected' | 'unavailable';
  videoId: string;
  startDate: string;
  endDate: string;
  checkedAt: string | null;
  daily: { date: string; views: number }[] | null;
  summary: {
    views: number;
    minutesWatched: number;
    averageSeconds: number;
  } | null;
  searchTerms: { term: string; views: number }[] | null;
};
// Verified public video. No copied view count: unavailable counts stay unknown.
export const YOUTUBE_FALLBACK: YouTubeFeed = {
  status: 'unavailable',
  checkedAt: null,
  videos: [
    {
      id: 'oDGqUMBvrpY',
      title: 'Day in the life of a Computational Biologist',
      publishedAt: '2026-04-13T05:33:47Z',
      views: null,
    },
  ],
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
      (original, entity: string) => {
        if (!entity.startsWith('#'))
          return (
            { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity] ??
            original
          );
        const n =
          entity[1].toLowerCase() === 'x'
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1));
        return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
          ? String.fromCodePoint(n)
          : '';
      }
    );
}

export function parseYouTubeFeed(xml: string): YouTubeVideo[] {
  if (
    xml.length > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    !/<feed\s/.test(xml)
  )
    throw new Error('Invalid YouTube feed');
  const videos: YouTubeVideo[] = [];
  for (const entry of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const get = (name: string) =>
      decodeXml(
        entry[1].match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? ''
      ).trim();
    const id = get('yt:videoId'),
      title = get('title'),
      publishedAt = get('published');
    if (
      !/^[A-Za-z0-9_-]{11}$/.test(id) ||
      get('yt:channelId') !== YOUTUBE_CHANNEL_ID ||
      !title ||
      !Number.isFinite(Date.parse(publishedAt)) ||
      videos.some((v) => v.id === id)
    )
      continue;
    const raw = entry[1].match(/<media:statistics\b[^>]*\bviews="(\d+)"/)?.[1];
    const views =
      raw !== undefined && Number.isSafeInteger(Number(raw))
        ? Number(raw)
        : null;
    videos.push({
      id,
      title: title.slice(0, 200),
      publishedAt: new Date(publishedAt).toISOString(),
      views,
    });
  }
  if (/<entry>/.test(xml) && !videos.length)
    throw new Error('No valid channel videos');
  return videos
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 15);
}

export function analyticsWindow(days: 28 | 90, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const end = new Date(today + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

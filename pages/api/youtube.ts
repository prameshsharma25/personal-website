import type { NextApiRequest, NextApiResponse } from 'next';
import { youtubeService } from '../../lib/youtube-server';

function cacheSeconds(checkedAt: string | null) {
  return checkedAt
    ? Math.max(1, 900 - Math.floor((Date.now() - Date.parse(checkedAt)) / 1000))
    : 1;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const { video, days } = req.query;
  if (
    video !== undefined &&
    (typeof video !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(video))
  )
    return res.status(400).json({ error: 'Choose a video from this channel.' });
  if (days !== undefined && days !== '28' && days !== '90')
    return res.status(400).json({ error: 'Choose a supported date range.' });
  const feed = await youtubeService.feed();
  if (!video) {
    res.setHeader(
      'Cache-Control',
      feed.status === 'fresh'
        ? `public, s-maxage=${cacheSeconds(feed.checkedAt)}, stale-while-revalidate=60`
        : 'no-store'
    );
    return res.status(200).json(feed);
  }
  if (!feed.videos.some((item) => item.id === video))
    return res
      .status(404)
      .json({ error: 'This video is not in the recent channel feed.' });
  const report = await youtubeService.analytics(
    video as string,
    days === '90' ? 90 : 28
  );
  if (report.status === 'available')
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${cacheSeconds(report.checkedAt)}`
    );
  return res.status(200).json(report);
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { getPostBySlug } from '../../lib/posts';
import { publicPostSlug } from '../../lib/substack-stats';
import { substackStatsService } from '../../lib/substack-stats-server';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const slug = req.query.slug;
  if (
    typeof slug !== 'string' ||
    slug.length > 180 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    return res.status(400).json({ error: 'Choose a valid post' });
  }
  let url: string;
  try {
    const post = getPostBySlug(slug);
    if (post.draft || !post.substackUrl || !publicPostSlug(post.substackUrl)) {
      return res
        .status(404)
        .json({ error: 'Substack statistics are not available for this post' });
    }
    url = post.substackUrl;
  } catch {
    return res.status(404).json({ error: 'Post not found' });
  }
  const stats = await substackStatsService.stats(url);
  // Successful responses can be shared at the edge. Failed/stale responses stay
  // out of the CDN cache so their timestamp never outlives the service's bound.
  if (stats.status === 'available' && stats.checkedAt) {
    const age = Math.max(
      0,
      Math.ceil((Date.now() - Date.parse(stats.checkedAt)) / 1000)
    );
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${Math.max(0, 3600 - age)}`
    );
  }
  return res.status(200).json(stats);
}

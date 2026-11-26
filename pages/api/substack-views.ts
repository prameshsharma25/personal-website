import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllPosts } from '../../lib/posts';
import { publicPostSlug } from '../../lib/substack-stats';
import { substackViewsService } from '../../lib/substack-views-server';

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
  )
    return res.status(400).json({ error: 'Choose a valid post' });
  const posts = getAllPosts().filter(
    (post) =>
      !post.draft && post.substackUrl && publicPostSlug(post.substackUrl)
  );
  const post = posts.find((post) => post.slug === slug);
  if (!post)
    return res
      .status(404)
      .json({ error: 'Substack views are not available for this post' });
  const stats = await substackViewsService.stats(
    post.substackUrl!,
    posts.map((post) => post.substackUrl!)
  );
  if (stats.status === 'available' && stats.checkedAt) {
    const age = Math.max(
      0,
      Math.ceil((Date.now() - Date.parse(stats.checkedAt)) / 1000)
    );
    res.setHeader('Cache-Control', `public, s-maxage=${Math.max(0, 60 - age)}`);
  }
  return res.status(200).json(stats);
}

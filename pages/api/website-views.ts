import type { NextApiRequest, NextApiResponse } from 'next';
import { getPostBySlug } from '../../lib/posts';
import { validViewSlug, validViewSession } from '../../lib/website-views';
import { websiteViewsService } from '../../lib/website-views-server';

export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };
const BOT =
  /bot\b|crawler|spider|preview|facebookexternalhit|slack|discord|whatsapp|headless/i;

function sameOrigin(req: NextApiRequest) {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !req.headers.host) return false;
  try {
    const url = new URL(origin);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (
      url.origin === origin &&
      url.host === req.headers.host &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && local)) &&
      (!req.headers['sec-fetch-site'] ||
        req.headers['sec-fetch-site'] === 'same-origin')
    );
  } catch {
    return false;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const slug = req.query.slug;
  if (!validViewSlug(slug))
    return res.status(400).json({ error: 'Choose a valid article' });
  try {
    if (getPostBySlug(slug).draft)
      return res.status(404).json({ error: 'Article not found' });
  } catch {
    return res.status(404).json({ error: 'Article not found' });
  }
  if (req.method === 'POST') {
    if (!sameOrigin(req))
      return res
        .status(403)
        .json({ error: 'Open the article on this website' });
    if (
      req.headers['content-type']?.split(';')[0].trim() !== 'application/json'
    )
      return res.status(415).json({ error: 'JSON required' });
    if (
      !req.body ||
      Array.isArray(req.body) ||
      !validViewSession(req.body.session)
    )
      return res.status(400).json({ error: 'Invalid view session' });
    const userAgent = req.headers['user-agent'];
    const prefetch =
      /prefetch/i.test(
        String(req.headers.purpose ?? '') +
          String(req.headers['sec-purpose'] ?? '')
      ) || req.headers['x-middleware-prefetch'] === '1';
    if (userAgent && !BOT.test(userAgent) && !prefetch) {
      return res
        .status(200)
        .json(await websiteViewsService.record(slug, req.body.session));
    }
  }
  // GET requests, crawlers, and link previews never increase the total.
  return res.status(200).json(await websiteViewsService.read(slug));
}

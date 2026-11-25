import type { NextApiRequest, NextApiResponse } from 'next';
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const value = process.env.AMYLOID_API_URL;
  if (!value) return res.status(200).json({ enabled: false });
  try {
    const url = new URL(value);
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Invalid URL');
    return res
      .status(200)
      .json({ enabled: true, url: url.toString().replace(/\/$/, '') });
  } catch {
    return res.status(200).json({ enabled: false });
  }
}

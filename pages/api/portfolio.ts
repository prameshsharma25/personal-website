import type { NextApiRequest, NextApiResponse } from 'next';
import { portfolioService } from '../../lib/portfolio-server';
import { portfolioHistoryService } from '../../lib/portfolio-history-server';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  // No public selectors can request a different brokerage account.
  if (Object.keys(req.query).length)
    return res
      .status(400)
      .json({ error: 'This portfolio has no account selector.' });
  const report = await portfolioService.read();
  if (report.status === 'available') {
    // Storage is optional: a history outage must not hide the current balance.
    if (report.snapshot && !report.stale)
      await portfolioHistoryService.record(report.snapshot);
    const age = report.checkedAt
      ? (Date.now() - Date.parse(report.checkedAt)) / 1000
      : 300;
    res.setHeader(
      'Cache-Control',
      `public, max-age=0, s-maxage=${Math.max(1, Math.min(300, Math.floor(300 - age)))}`
    );
  }
  return res.status(200).json(report);
}

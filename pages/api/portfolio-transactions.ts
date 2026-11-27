import type { NextApiRequest, NextApiResponse } from 'next';
import { transactionsService } from '../../lib/portfolio-transactions-server';
import { validTransactionOffset } from '../../lib/portfolio-transactions';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const raw = req.query.offset;
  if (
    Object.keys(req.query).some((key) => key !== 'offset') ||
    (raw !== undefined &&
      (typeof raw !== 'string' || !/^\d{1,6}$/.test(raw))) ||
    !validTransactionOffset(Number(raw ?? 0))
  )
    return res.status(400).json({ error: 'Invalid history page.' });
  const report = await transactionsService.read(Number(raw ?? 0));
  if (report.status === 'available' && !report.stale) {
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

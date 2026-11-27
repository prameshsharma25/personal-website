import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortfolioService } from '../../lib/portfolio-server';
import {
  authorizedPortfolioCron,
  portfolioHistoryService,
} from '../../lib/portfolio-history-server';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  if (
    !authorizedPortfolioCron(req.headers.authorization, process.env.CRON_SECRET)
  )
    return res.status(401).json({ error: 'Unauthorized.' });
  if (Object.keys(req.query).length) return res.status(400).end();
  if (
    process.env.PORTFOLIO_PUBLIC_ENABLED !== 'true' ||
    process.env.PORTFOLIO_HISTORY_ENABLED === 'false'
  )
    return res.status(200).json({ status: 'disabled' });
  const report = await createPortfolioService().read();
  if (!report.snapshot) return res.status(503).json({ status: 'unavailable' });
  const status = await portfolioHistoryService.record(report.snapshot);
  return res.status(status === 'unavailable' ? 503 : 200).json({ status });
}

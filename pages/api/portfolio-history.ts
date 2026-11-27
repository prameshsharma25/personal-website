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
  const { symbol } = req.query;
  if (
    Object.keys(req.query).length !== 1 ||
    typeof symbol !== 'string' ||
    !symbol ||
    symbol.length > 40
  )
    return res.status(400).json({ error: 'Select one holding.' });
  const portfolio = await portfolioService.read();
  // Only positions in the currently published account can be requested.
  if (!portfolio.snapshot?.holdings.some((h) => h.symbol === symbol))
    return res.status(404).json({ error: 'Holding unavailable.' });
  const history = await portfolioHistoryService.read(symbol);
  if (history.status === 'available')
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  return res.status(200).json(history);
}

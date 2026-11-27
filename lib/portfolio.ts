export const PORTFOLIO_GOAL = 10_000;
export const PORTFOLIO_REFRESH_MS = 5 * 60 * 1000;

// This is the entire public contract. Never pass through a brokerage response.
export type PublicHolding = {
  symbol: string;
  name: string;
  percent: number | null;
};
export type PortfolioSnapshot = {
  total: number;
  currency: 'USD';
  holdings: PublicHolding[];
  balanceAsOf: string | null;
  holdingsAsOf: string | null;
  incompleteHoldings: boolean;
};
export type PortfolioReport = {
  status: 'available' | 'unconfigured' | 'unavailable';
  mode: 'synced' | 'manual' | null;
  snapshot: PortfolioSnapshot | null;
  checkedAt: string | null;
  stale: boolean;
};

export const emptyPortfolio = (): PortfolioReport => ({
  status: 'unconfigured',
  mode: null,
  snapshot: null,
  checkedAt: null,
  stale: false,
});

export function goalProgress(total: number) {
  return {
    percent: Math.min(100, Math.max(0, (total / PORTFOLIO_GOAL) * 100)),
    remaining: Math.max(0, PORTFOLIO_GOAL - total),
    reached: total >= PORTFOLIO_GOAL,
  };
}

// Contribution arithmetic only: no forecast of prices, returns, fees or taxes.
export function contributionMonths(
  total: number,
  monthly: number
): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(monthly) || monthly < 0)
    return null;
  const remaining = goalProgress(total).remaining;
  if (!remaining) return 0;
  return monthly > 0 ? Math.ceil(remaining / monthly) : null;
}

export function publicHttpsLink(
  raw: string | undefined,
  domains: string[]
): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      domains.some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`)
      )
      ? url.href
      : null;
  } catch {
    return null;
  }
}

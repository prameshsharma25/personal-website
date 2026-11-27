export const TRANSACTION_PAGE_SIZE = 50;
export const MAX_TRANSACTION_OFFSET = 100_000;
export const TRANSACTION_TYPES = {
  BUY: 'Purchase',
  SELL: 'Sale',
  DIVIDEND: 'Dividend',
  SUBSTITUTE_DIVIDEND: 'Payment In Lieu Of Dividend',
  REI: 'Reinvestment',
} as const;
export type TransactionType = keyof typeof TRANSACTION_TYPES;
export type PublicTransaction = {
  id: string;
  date: string;
  type: TransactionType;
  symbol: string;
  name: string;
  amount: number | null;
  currency: 'USD';
};
export type PortfolioTransactions = {
  status: 'available' | 'disabled' | 'unavailable';
  transactions: PublicTransaction[];
  nextOffset: number | null;
  syncedThrough: string | null;
  syncComplete: boolean | null;
  checkedAt: string | null;
  stale: boolean;
  omitted: boolean;
};
export const emptyTransactions = (
  status: PortfolioTransactions['status'] = 'disabled'
): PortfolioTransactions => ({
  status,
  transactions: [],
  nextOffset: null,
  syncedThrough: null,
  syncComplete: null,
  checkedAt: null,
  stale: false,
  omitted: false,
});
export const validTransactionOffset = (value: number) =>
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= MAX_TRANSACTION_OFFSET &&
  value % TRANSACTION_PAGE_SIZE === 0;

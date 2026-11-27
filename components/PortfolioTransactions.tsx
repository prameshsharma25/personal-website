import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emptyTransactions,
  TRANSACTION_TYPES,
  type PortfolioTransactions as TransactionReport,
  type TransactionType,
} from '../lib/portfolio-transactions';
import styles from '../styles/PortfolioTransactions.module.css';

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
const money = (amount: number) =>
  `${amount > 0 ? '+' : ''}${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)}`;

export default function PortfolioTransactions({
  checkedAt,
  selectedSymbol,
}: {
  checkedAt: string | null;
  selectedSymbol: string | null;
}) {
  const [report, setReport] = useState<TransactionReport | null>(null);
  const [phase, setPhase] = useState<'idle' | 'refresh' | 'older'>('refresh');
  const [error, setError] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [kind, setKind] = useState('');
  const [visible, setVisible] = useState(10);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const load = useCallback(async (offset: number) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const ticket = ++generation.current;
    setPhase(offset ? 'older' : 'refresh');
    setError(false);
    try {
      const response = await fetch(
        `/api/portfolio-transactions?offset=${offset}`,
        { signal: request.signal }
      );
      if (!response.ok) throw new Error('Activity unavailable');
      const next = (await response.json()) as TransactionReport;
      if (
        !['available', 'disabled', 'unavailable'].includes(next.status) ||
        !Array.isArray(next.transactions)
      )
        throw new Error('Invalid activity');
      if (ticket !== generation.current || request.signal.aborted) return;
      if (next.status === 'unavailable')
        throw new Error('Activity unavailable');
      setReport((previous) => {
        if (!offset || !previous || next.status === 'disabled') return next;
        const unique = new Map(
          previous.transactions.map((row) => [row.id, row])
        );
        for (const row of next.transactions) unique.set(row.id, row);
        return {
          ...next,
          omitted: previous.omitted || next.omitted,
          transactions: Array.from(unique.values()).sort((a, b) =>
            b.date.localeCompare(a.date)
          ),
        };
      });
      if (!offset) setVisible(10);
      else setVisible((value) => value + 10);
    } catch {
      if (ticket === generation.current && !request.signal.aborted) {
        setError(true);
        setReport((previous) =>
          previous
            ? { ...previous, stale: true }
            : emptyTransactions('unavailable')
        );
      }
    } finally {
      if (ticket === generation.current && !request.signal.aborted)
        setPhase('idle');
    }
  }, []);
  useEffect(() => {
    void load(0);
    return () => {
      controller.current?.abort();
      generation.current++;
    };
  }, [checkedAt, load]);
  useEffect(() => {
    setSymbol(selectedSymbol ?? '');
    setVisible(10);
  }, [selectedSymbol]);

  if (report?.status === 'disabled') return null;
  const rows = (report?.transactions ?? []).filter(
    (row) => (!symbol || row.symbol === symbol) && (!kind || row.type === kind)
  );
  const symbols = Array.from(
    new Set([
      ...(report?.transactions ?? []).map((row) => row.symbol),
      ...(selectedSymbol ? [selectedSymbol] : []),
    ])
  ).sort();
  const busy = phase !== 'idle';
  return (
    <section className={styles.section} aria-labelledby="transactions-title">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Account Activity</p>
          <h2 id="transactions-title">Recent Transactions</h2>
        </div>
        <button type="button" onClick={() => void load(0)} disabled={busy}>
          {phase === 'refresh' ? 'Checking…' : 'Check For New Activity'}
        </button>
      </header>
      <p className={styles.intro}>
        My stock and fund purchases, sales, dividends, and reinvestments.
        Amounts show cash spent or received, not investment gains.
      </p>
      <div className={styles.meta}>
        <span>
          {report?.syncedThrough ? (
            <>
              History Synced Through{' '}
              <time dateTime={report.syncedThrough}>
                {dateLabel(report.syncedThrough)}
              </time>
            </>
          ) : (
            'History Sync Date Not Reported'
          )}
        </span>
        <span>Daily Brokerage Updates</span>
      </div>
      <p className={styles.note}>
        New transactions may take time to appear. Dates are shown as reported by
        the brokerage in UTC. Only activity in USD is included.
      </p>
      {report?.syncComplete === false && (
        <p role="status" className={styles.notice}>
          The initial history sync is still in progress. More transactions may
          appear after it finishes.
        </p>
      )}
      {!error && report?.stale && (
        <p role="status" className={styles.notice}>
          This history is older or its freshness could not be confirmed. The
          last available activity is shown.
        </p>
      )}
      {error && (
        <p role="status" className={styles.notice}>
          Transaction history could not be updated.{' '}
          {report?.transactions.length
            ? 'The activity already loaded remains visible.'
            : 'Please try again later.'}
        </p>
      )}
      {report?.status === 'available' && (
        <>
          <div className={styles.filters}>
            <label>
              Holding
              <select
                aria-label="Filter Transactions By Holding"
                value={symbol}
                onChange={(event) => {
                  setSymbol(event.target.value);
                  setVisible(10);
                }}
              >
                <option value="">All Holdings</option>
                {symbols.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Activity
              <select
                aria-label="Filter Transactions By Activity"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value);
                  setVisible(10);
                }}
              >
                <option value="">All Activity</option>
                {Object.entries(TRANSACTION_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {(symbol || kind) && (
              <button
                type="button"
                onClick={() => {
                  setSymbol('');
                  setKind('');
                  setVisible(10);
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
          <p className={styles.note} aria-live="polite">
            {Math.min(visible, rows.length)} Of {rows.length} Matching
            Transactions Loaded
            {report.nextOffset !== null
              ? '. Load older activity to extend the list and filters.'
              : '.'}
          </p>
          {rows.length ? (
            <div
              className={styles.scroll}
              tabIndex={0}
              role="region"
              aria-label="Transaction List"
            >
              <ul className={styles.list}>
                {rows.slice(0, visible).map((row) => (
                  <li key={row.id}>
                    <div className={styles.holding}>
                      <strong>{row.symbol}</strong>
                      <span>{row.name}</span>
                    </div>
                    <div className={styles.activity}>
                      <span className={styles.badge} data-kind={row.type}>
                        {TRANSACTION_TYPES[row.type as TransactionType]}
                      </span>
                      <time dateTime={row.date}>{dateLabel(row.date)}</time>
                    </div>
                    <div className={styles.amount}>
                      <span>Cash Movement</span>
                      <strong>
                        {row.amount === null
                          ? 'Not Available'
                          : money(row.amount)}
                      </strong>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className={styles.empty}>
              {symbol || kind
                ? 'No loaded transactions match these filters.'
                : 'No eligible transactions were returned in this history page.'}
            </p>
          )}
          <div className={styles.actions}>
            {visible < rows.length ? (
              <button
                type="button"
                onClick={() => setVisible((value) => value + 10)}
              >
                Show More Transactions
              </button>
            ) : (
              report.nextOffset !== null && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void load(report.nextOffset!)}
                >
                  {phase === 'older'
                    ? 'Loading Older Activity…'
                    : 'Load Older Activity'}
                </button>
              )
            )}
            {report.omitted && (
              <span className={styles.note}>
                Some records could not be included in this stock and fund
                activity feed.
              </span>
            )}
          </div>
        </>
      )}
      {!report && (
        <p className={styles.empty} role="status">
          Loading Transaction History…
        </p>
      )}
    </section>
  );
}

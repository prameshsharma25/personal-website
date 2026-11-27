import { useEffect, useRef, useState } from 'react';
import type { PositionHistory, PublicHolding } from '../lib/portfolio';
import styles from '../styles/PortfolioHoldingDetails.module.css';

const dollars = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
const money = (n: number | null | undefined) =>
  n == null ? 'Not Available' : dollars(n);
const signed = (n: number) => `${n > 0 ? '+' : ''}${dollars(n)}`;
const date = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'America/New_York',
  }).format(new Date(value));
const fullDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  }).format(new Date(value)) + ' ET';
const DAY = 86_400_000;

export default function PortfolioHoldingDetails({
  holding,
  asOf,
  checkedAt,
  onClose,
}: {
  holding: PublicHolding;
  asOf: string | null;
  checkedAt: string | null;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<PositionHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const [chartWidth, setChartWidth] = useState(800);
  const panel = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    title.current?.scrollIntoView({ block: 'nearest' });
    if (!panel.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setChartWidth(entry.contentRect.width < 600 ? 400 : 800);
    });
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/portfolio-history?symbol=${encodeURIComponent(holding.symbol)}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('History unavailable');
        const next = (await response.json()) as PositionHistory;
        if (
          next.symbol !== holding.symbol ||
          !Array.isArray(next.points) ||
          !['available', 'unavailable', 'disabled'].includes(next.status)
        )
          throw new Error('Invalid history');
        if (!controller.signal.aborted) {
          setHistory(next);
          setHover(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setHistory({
            status: 'unavailable',
            symbol: holding.symbol,
            points: [],
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [holding.symbol, checkedAt, retry]);

  const points = (history?.points ?? []).filter(
    (point) => !range || Date.parse(point.asOf) >= Date.now() - range * DAY
  );
  const index =
    hover === null ? points.length - 1 : Math.min(hover, points.length - 1);
  const point = points[index];
  const first = points[0],
    last = points.at(-1);
  const low = Math.min(...points.map((p) => p.value)),
    high = Math.max(...points.map((p) => p.value));
  const padding = Math.max((high - low) * 0.15, Math.abs(high) * 0.015, 1);
  const min = low - padding,
    max = high + padding;
  const left = chartWidth === 400 ? 65 : 78,
    right = chartWidth - 22,
    top = 24,
    bottom = 222;
  const startTime = first ? Date.parse(first.asOf) : 0;
  const duration = last ? Date.parse(last.asOf) - startTime : 0;
  const x = (asOf: string) =>
    duration
      ? left + ((Date.parse(asOf) - startTime) / duration) * (right - left)
      : (left + right) / 2;
  const y = (value: number) =>
    bottom - ((value - min) / (max - min)) * (bottom - top);
  const path = points
    .map((p, i) => {
      // An unrecorded day is a gap, never a zero or an invented daily value.
      const gap =
        i === 0 ||
        Date.parse(p.asOf) - Date.parse(points[i - 1].asOf) >
          36 * 60 * 60 * 1000;
      return `${gap ? 'M' : 'L'}${x(p.asOf)},${y(p.value)}`;
    })
    .join(' ');
  const gain = holding.unrealizedGain;

  return (
    <section
      id="holding-details"
      ref={panel}
      className={styles.panel}
      aria-labelledby="holding-detail-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Inside This Holding</p>
          <h3 id="holding-detail-title" ref={title} tabIndex={-1}>
            {holding.symbol} <span>{holding.name}</span>
          </h3>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close Holding Details"
        >
          ×
        </button>
      </header>
      <dl className={styles.metrics}>
        <div>
          <dt>Position Value</dt>
          <dd>{money(holding.marketValue)}</dd>
        </div>
        <div>
          <dt>
            {holding.side === 'short'
              ? 'Opening Value (Short)'
              : holding.side === 'mixed'
                ? 'Gross Opening Basis'
                : 'Cost Basis'}
          </dt>
          <dd>{money(holding.costBasis)}</dd>
        </div>
        <div>
          <dt>Unrealized Gain Or Loss</dt>
          <dd
            data-direction={
              gain == null
                ? undefined
                : gain < 0
                  ? 'loss'
                  : gain > 0
                    ? 'gain'
                    : 'flat'
            }
          >
            {gain == null ? 'Not Available' : signed(gain)}
            {holding.unrealizedGainPercent != null && (
              <span>
                {holding.unrealizedGainPercent > 0 ? '+' : ''}
                {holding.unrealizedGainPercent.toFixed(2)}%
              </span>
            )}
          </dd>
        </div>
      </dl>
      <p className={styles.note}>
        {asOf ? (
          <>
            As Of <time dateTime={asOf}>{fullDate(asOf)}</time>.{' '}
          </>
        ) : (
          'Snapshot time is not reported. '
        )}
        {holding.costBasis == null
          ? 'The connection has not supplied a usable cost basis. '
          : ''}
        {holding.side === 'short' || holding.side === 'mixed'
          ? 'Opening basis uses the absolute value of each position; gains account for its direction. '
          : ''}
        Unrealized results describe open holdings. They exclude realized gains
        and dividends and are not a tax calculation.
      </p>
      <div className={styles.chartHead}>
        <h4>Position Value Over Time</h4>
        <div
          className={styles.ranges}
          role="group"
          aria-label="Position History Range"
        >
          {[
            [30, '1M'],
            [90, '3M'],
            [365, '1Y'],
            [0, 'All'],
          ].map(([days, label]) => (
            <button
              type="button"
              key={days}
              aria-pressed={range === days}
              onClick={() => {
                setRange(Number(days));
                setHover(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.note}>
        Daily observations of my position’s value, including changes from buying
        or selling shares. This is not a measure of investment return.
      </p>
      {loading ? (
        <p className={styles.empty} role="status">
          Loading Position History…
        </p>
      ) : history?.status !== 'available' ? (
        <div className={styles.empty} role="status">
          <strong>
            {history?.status === 'disabled'
              ? 'Position History Is Not Connected Yet'
              : 'Position History Is Temporarily Unavailable'}
          </strong>
          <p>The current holding details remain available above.</p>
          {history?.status === 'unavailable' && (
            <button type="button" onClick={() => setRetry((v) => v + 1)}>
              Try History Again
            </button>
          )}
        </div>
      ) : !points.length ? (
        <div className={styles.empty} role="status">
          <strong>
            {history.points.length
              ? 'No Observations In This Range'
              : 'Collecting Position History'}
          </strong>
          <p>
            {history.points.length
              ? 'Select All to see the recorded observations.'
              : 'The chart begins with the first recorded snapshot. Earlier position values are not available.'}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.readout} aria-live="polite" aria-atomic="true">
            <div>
              <span>Recorded Position Value</span>
              <strong data-history-value>{dollars(point.value)}</strong>
              <time dateTime={point.asOf}>{fullDate(point.asOf)}</time>
            </div>
            {points.length > 1 && (
              <div className={styles.change}>
                <span>Change In Position Value</span>
                <strong>{signed(last!.value - first.value)}</strong>
                <small>Across These Observations</small>
              </div>
            )}
          </div>
          <svg
            className={styles.chart}
            viewBox={`0 0 ${chartWidth} 260`}
            role="img"
            aria-label={`${holding.symbol} position value history, ${points.length} recorded observations`}
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const cursor =
                ((event.clientX - rect.left) / rect.width) * chartWidth;
              let nearest = 0;
              points.forEach((p, i) => {
                if (
                  Math.abs(x(p.asOf) - cursor) <
                  Math.abs(x(points[nearest].asOf) - cursor)
                )
                  nearest = i;
              });
              setHover(nearest);
            }}
            onPointerLeave={() => setHover(null)}
          >
            {[min, (min + max) / 2, max].map((tick) => (
              <g key={tick}>
                <line
                  x1={left}
                  x2={right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className={styles.grid}
                />
                <text x={left - 10} y={y(tick) + 4} textAnchor="end">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(tick)}
                </text>
              </g>
            ))}
            <path d={path} className={styles.line} />
            {points.map((p) => (
              <circle
                key={p.asOf}
                cx={x(p.asOf)}
                cy={y(p.value)}
                r={points.length === 1 ? 5 : 2.5}
                className={styles.dot}
              />
            ))}
            <line
              x1={x(point.asOf)}
              x2={x(point.asOf)}
              y1={top}
              y2={bottom}
              className={styles.cursor}
            />
            <circle
              cx={x(point.asOf)}
              cy={y(point.value)}
              r="6"
              className={styles.activeDot}
            />
            <text x={left} y="250">
              {date(first.asOf)}
            </text>
            {points.length > 1 && (
              <text x={right} y="250" textAnchor="end">
                {date(last!.asOf)}
              </text>
            )}
          </svg>
          {points.length > 1 ? (
            <label className={styles.slider}>
              Explore Observations
              <input
                aria-label="Recorded Observation"
                type="range"
                min="0"
                max={points.length - 1}
                value={index}
                onChange={(event) => setHover(Number(event.target.value))}
              />
            </label>
          ) : (
            <p className={styles.note}>
              First snapshot recorded. A trend will appear as more days are
              collected.
            </p>
          )}
          <p className={styles.note}>
            Each dot is a recorded snapshot. Missing dates are left as gaps.
            Times are shown in Eastern Time; brokerage prices may be delayed.
          </p>
          <details className={styles.tableDetails}>
            <summary>View Recorded Values</summary>
            <div className={styles.tableScroll}>
              <table>
                <caption>{holding.symbol} Position Observations</caption>
                <thead>
                  <tr>
                    <th scope="col">Observed At (ET)</th>
                    <th scope="col">Position Value</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.asOf}>
                      <td>{fullDate(p.asOf)}</td>
                      <td>{dollars(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import Seo from '../components/Seo';
import PageIntro from '../components/PageIntro';
import {
  contributionMonths,
  emptyPortfolio,
  goalProgress,
  PORTFOLIO_GOAL,
  PORTFOLIO_REFRESH_MS,
  publicHttpsLink,
  type PortfolioReport,
} from '../lib/portfolio';
import ui from '../styles/Interface.module.css';
import styles from '../styles/Portfolio.module.css';

type Props = { referralUrl: string | null; coffeeUrl: string };
const dollars = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
const colors = [
  '#84cfff',
  '#a29dff',
  '#54dbd0',
  '#ffc17d',
  '#e5a5e8',
  '#9db8ff',
];
function dateLabel(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/New_York',
      }).format(new Date(value)) + ' ET'
    : 'Not Reported';
}
function Icon({ kind }: { kind: 'coffee' | 'arrow' | 'leaf' | 'code' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'coffee' ? (
        <>
          <path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 1h1a3 3 0 0 1 0 6h-1M3 22h17M8 2v3m5-3v3" />
        </>
      ) : kind === 'leaf' ? (
        <>
          <path d="M5 20C18 19 21 11 19 3 8 4 3 10 5 20Z" />
          <path d="m4 22 11-13M9 16l-1-5m4 2h5" />
        </>
      ) : kind === 'code' ? (
        <path d="m7 7-5 5 5 5m10-10 5 5-5 5m-3-13-4 20" />
      ) : (
        <path d="M5 19 19 5M5 5h14v14" />
      )}
    </svg>
  );
}

export default function RoadTo10000({ referralUrl, coffeeUrl }: Props) {
  const [report, setReport] = useState<PortfolioReport>(emptyPortfolio);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<'allocation' | 'name'>('allocation');
  const [monthly, setMonthly] = useState('100');
  const [exampleStart, setExampleStart] = useState<string | null>(null);
  const lastRefresh = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/portfolio', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Portfolio unavailable');
        const next = (await response.json()) as PortfolioReport;
        if (!['available', 'unconfigured', 'unavailable'].includes(next.status))
          throw new Error('Invalid portfolio');
        setReport((previous) =>
          next.status === 'unavailable' && previous.snapshot
            ? { ...previous, stale: true }
            : next
        );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setReport((previous) =>
            previous.snapshot
              ? { ...previous, stale: true }
              : { ...emptyPortfolio(), status: 'unavailable' }
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          lastRefresh.current = Date.now();
        }
      });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    function check() {
      if (
        !document.hidden &&
        Date.now() - lastRefresh.current >= PORTFOLIO_REFRESH_MS
      )
        setRefresh((value) => value + 1);
    }
    const timer = setInterval(check, PORTFOLIO_REFRESH_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  const snapshot = report.snapshot;
  const progress = snapshot ? goalProgress(snapshot.total) : null;
  const holdings = [...(snapshot?.holdings ?? [])].sort((a, b) =>
    sort === 'name'
      ? a.symbol.localeCompare(b.symbol)
      : Math.abs(b.percent ?? 0) - Math.abs(a.percent ?? 0)
  );
  const activeHolding = holdings.find((holding) => holding.symbol === selected);
  const start = exampleStart ?? String(snapshot?.total ?? 0);
  const months =
    start.trim() && monthly.trim()
      ? contributionMonths(Number(start), Number(monthly))
      : null;
  const status =
    loading && !snapshot
      ? 'Checking For An Update'
      : report.status === 'unconfigured'
        ? 'First Update Coming Soon'
        : report.status === 'unavailable'
          ? 'Update Unavailable'
          : report.mode === 'manual'
            ? 'Dated Portfolio Snapshot'
            : 'Automatically Synced';

  return (
    <>
      <Seo
        title="Road To $10,000"
        description="Follow Pramesh Sharma’s personal portfolio journey toward $10,000, explore his holdings, and support the research tools and guides he builds."
        path="/road-to-10000"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Road To $10,000', path: '/road-to-10000' },
        ]}
      />
      <main className={`${ui.page} ${styles.page}`}>
        <PageIntro
          eyebrow="A Personal Goal / Shared In Public"
          title="Road To"
          accent="$10,000."
          description="I’m working toward a $10,000 investment portfolio. This is where I’ll share what I hold, keep track of my progress, and make the goal a little more tangible."
        />
        <div className={styles.jumpLinks}>
          <a href="#portfolio">
            The Portfolio <span aria-hidden="true">↓</span>
          </a>
          <a href="#the-plan">
            The Plan <span aria-hidden="true">↓</span>
          </a>
          <a href="#support">
            Support My Work <span aria-hidden="true">↗</span>
          </a>
        </div>
        <noscript>
          <p className={styles.small}>
            Enable JavaScript to load portfolio updates and use the calculator.
            The support links below work without it.
          </p>
        </noscript>
        <section
          id="portfolio"
          className={styles.dashboard}
          aria-labelledby="portfolio-title"
        >
          <div className={styles.dashboardHead}>
            <h2 id="portfolio-title">The Portfolio</h2>
            <span className={styles.status}>
              <i data-connected={Boolean(snapshot)} />
              {status}
            </span>
          </div>
          <div className={styles.overview}>
            <div>
              <p className={styles.kicker}>Current Portfolio Value</p>
              <p className={styles.balance} data-portfolio-value>
                {snapshot ? (
                  dollars(snapshot.total)
                ) : (
                  <span className={styles.pending}>Awaiting First Update</span>
                )}
              </p>
              <p className={styles.balanceNote}>
                {snapshot
                  ? 'Account value in USD. This includes cash and invested assets.'
                  : 'My balance and holdings will appear here once I share the first account update.'}
              </p>
              <dl className={styles.numbers}>
                <div>
                  <dt>The Goal</dt>
                  <dd>$10,000</dd>
                </div>
                <div>
                  <dt>{progress?.reached ? 'Goal Status' : 'Still To Go'}</dt>
                  <dd>
                    {progress
                      ? progress.reached
                        ? 'Reached'
                        : dollars(progress.remaining)
                      : 'Not Available Yet'}
                  </dd>
                </div>
              </dl>
            </div>
            <div
              className={styles.gauge}
              role={progress ? 'meter' : undefined}
              aria-label="Progress Toward $10,000"
              aria-valuemin={progress ? 0 : undefined}
              aria-valuemax={progress ? 100 : undefined}
              aria-valuenow={progress?.percent}
              aria-valuetext={
                progress ? `${dollars(snapshot.total)} of $10,000` : undefined
              }
            >
              <svg viewBox="0 0 260 260" aria-hidden="true">
                <circle
                  className={styles.outerRing}
                  cx="130"
                  cy="130"
                  r="120"
                />
                <circle className={styles.track} cx="130" cy="130" r="102" />
                <circle
                  className={styles.fill}
                  cx="130"
                  cy="130"
                  r="102"
                  pathLength="100"
                  strokeDasharray={`${progress?.percent ?? 0} 100`}
                  transform="rotate(-90 130 130)"
                />
              </svg>
              <div>
                <strong>
                  {progress ? `${progress.percent.toFixed(1)}%` : '$10K'}
                </strong>
                <span>{progress ? 'Of The Goal' : 'The Destination'}</span>
              </div>
            </div>
          </div>
          <ol className={styles.milestones} aria-label="Portfolio Milestones">
            {[1000, 2500, 5000, 7500, PORTFOLIO_GOAL].map((amount) => (
              <li
                key={amount}
                data-reached={snapshot && snapshot.total >= amount}
              >
                <span aria-hidden="true">
                  {snapshot && snapshot.total >= amount ? '✓' : '○'}
                </span>
                <strong>${amount.toLocaleString('en-US')}</strong>
                <small>
                  {snapshot
                    ? snapshot.total >= amount
                      ? 'At Or Above'
                      : 'Ahead'
                    : 'Milestone'}
                </small>
              </li>
            ))}
          </ol>
          <div className={styles.freshness}>
            <div>
              {snapshot ? (
                <>
                  <p>
                    Balance As Of:{' '}
                    <time dateTime={snapshot.balanceAsOf ?? undefined}>
                      {dateLabel(snapshot.balanceAsOf)}
                    </time>
                  </p>
                  <p>
                    Holdings As Of:{' '}
                    <time dateTime={snapshot.holdingsAsOf ?? undefined}>
                      {dateLabel(snapshot.holdingsAsOf)}
                    </time>
                  </p>
                  <p>
                    {report.mode === 'manual'
                      ? 'Shared manually. Values stay unchanged until the next snapshot.'
                      : 'Source: Robinhood via SnapTrade. The page checks every five minutes; brokerage updates and prices may be delayed.'}
                  </p>
                </>
              ) : (
                <p>
                  {report.status === 'unavailable'
                    ? 'The account update is temporarily unavailable. Please check again later.'
                    : 'The goal is set. The account data has not been published yet.'}
                </p>
              )}
              {snapshot && report.stale && (
                <p className={styles.stale} role="status">
                  This is an older snapshot or its freshness could not be
                  confirmed. The last available values are shown.
                </p>
              )}
            </div>
            <button
              className={styles.refresh}
              onClick={() => setRefresh((value) => value + 1)}
              disabled={loading}
            >
              {loading ? 'Checking…' : 'Check For Update'}
            </button>
          </div>
        </section>

        <section
          className={styles.holdingsSection}
          aria-labelledby="holdings-title"
        >
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>01 / What I Hold</p>
              <h2 id="holdings-title">Inside The Portfolio</h2>
            </div>
            {holdings.length > 1 && (
              <label className={styles.sort}>
                Sort By
                <select
                  value={sort}
                  onChange={(event) =>
                    setSort(event.target.value as typeof sort)
                  }
                >
                  <option value="allocation">Portfolio Weight</option>
                  <option value="name">Stock Symbol</option>
                </select>
              </label>
            )}
          </div>
          {holdings.length ? (
            <>
              <p className={styles.muted}>
                Select a holding to see its share of the total account value.
                Share counts and purchase prices are private.
              </p>
              <div className={styles.holdings}>
                {holdings.map((holding, index) => (
                  <button
                    key={holding.symbol}
                    className={styles.holding}
                    aria-pressed={selected === holding.symbol}
                    onClick={() =>
                      setSelected((current) =>
                        current === holding.symbol ? null : holding.symbol
                      )
                    }
                    style={
                      {
                        '--holding-color': colors[index % colors.length],
                      } as CSSProperties
                    }
                  >
                    <span className={styles.holdingHeading}>
                      <strong>{holding.symbol}</strong>
                      <b>
                        {holding.percent === null
                          ? 'Not Available'
                          : `${holding.percent.toFixed(2)}%`}
                      </b>
                    </span>
                    <span className={styles.stockName}>{holding.name}</span>
                    <span className={styles.holdingTrack} aria-hidden="true">
                      <i
                        style={{
                          width: `${Math.min(100, Math.abs(holding.percent ?? 0))}%`,
                        }}
                      />
                    </span>
                  </button>
                ))}
              </div>
              <p className={styles.selection} aria-live="polite">
                {activeHolding ? (
                  <>
                    <strong>{activeHolding.name}</strong>
                    {activeHolding.percent === null
                      ? ': portfolio weight cannot be calculated from a zero or negative account value.'
                      : ` represents ${activeHolding.percent.toFixed(2)}% of the account value in this snapshot.`}
                  </>
                ) : (
                  'Portfolio weight reflects position value relative to total account value.'
                )}
              </p>
              <p className={styles.small}>
                Cash and other assets may not appear in this list, so these
                percentages need not add up to 100%. Borrowing or short
                positions can produce weights above 100% or below zero.
                {snapshot.incompleteHoldings
                  ? ' Some positions could not be included in this stock and fund breakdown.'
                  : ''}
              </p>
            </>
          ) : (
            <div className={styles.emptyHoldings}>
              <span className={styles.emptyBars} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <div>
                <h3>
                  {snapshot
                    ? 'No Stocks Or Funds To Display'
                    : 'Holdings Coming Soon'}
                </h3>
                <p>
                  {snapshot
                    ? 'There are no supported stock or fund positions in the current update.'
                    : 'Stock names and portfolio percentages will appear alongside the first update.'}
                </p>
              </div>
            </div>
          )}
        </section>

        <section
          id="the-plan"
          className={styles.plan}
          aria-labelledby="plan-title"
        >
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>02 / One Step At A Time</p>
              <h2 id="plan-title">Making Progress Concrete</h2>
            </div>
          </div>
          <div className={styles.planGrid}>
            <div className={styles.steps}>
              <article>
                <span>01</span>
                <div>
                  <h3>Keep The Goal Visible</h3>
                  <p>
                    A balance, a target, and a clear record of what I hold.
                    Progress here means account value, which can change through
                    contributions, withdrawals, and market movements.
                  </p>
                </div>
              </article>
              <article>
                <span>02</span>
                <div>
                  <h3>Make Room To Contribute</h3>
                  <p>
                    The calculator shows what regular contributions alone would
                    add. It’s a way to explore the distance to the goal without
                    guessing what the market will do.
                  </p>
                </div>
              </article>
              <article>
                <span>03</span>
                <div>
                  <h3>Keep Building</h3>
                  <p>
                    I’m also building research tools and sharing what I’ve
                    learned along the way. You can{' '}
                    <Link href="/tools">try the tools</Link>,{' '}
                    <Link href="/resources">explore my guides</Link>, or support
                    the work below.
                  </p>
                </div>
              </article>
            </div>
            <div className={styles.calculator}>
              <p className={styles.kicker}>Explore Contributions</p>
              <h3>What Could Consistency Add?</h3>
              <p className={styles.small}>
                An example you can adjust. These inputs do not change my
                portfolio.
              </p>
              <div className={styles.inputs}>
                <label>
                  Starting Balance ($)
                  <input
                    type="number"
                    step="0.01"
                    value={start}
                    onChange={(event) => setExampleStart(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label>
                  Monthly Contribution ($)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={monthly}
                    onChange={(event) => setMonthly(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
              </div>
              <div
                className={styles.presets}
                aria-label="Example Monthly Contributions"
              >
                {[100, 250, 500].map((amount) => (
                  <button
                    key={amount}
                    aria-pressed={monthly === String(amount)}
                    onClick={() => setMonthly(String(amount))}
                  >
                    ${amount}/Month
                  </button>
                ))}
              </div>
              <output className={styles.projection} aria-live="polite">
                {months === null ? (
                  <strong>Enter A Monthly Contribution</strong>
                ) : months === 0 ? (
                  <strong>Already At The Goal</strong>
                ) : (
                  <>
                    <strong>
                      {months.toLocaleString('en-US')}{' '}
                      <span>{months === 1 ? 'Month' : 'Months'}</span>
                    </strong>
                    <span>To Reach $10,000 With Contributions Alone</span>
                  </>
                )}
              </output>
              <p className={styles.small}>
                Assumes the starting balance stays flat and contributions arrive
                monthly. Excludes investment gains, losses, withdrawals, fees,
                and taxes. This is arithmetic, not a forecast.
              </p>
              {snapshot && exampleStart !== null && (
                <button
                  className={styles.textButton}
                  onClick={() => setExampleStart(null)}
                >
                  Use Current Portfolio Balance
                </button>
              )}
            </div>
          </div>
        </section>

        <section
          id="support"
          className={styles.support}
          aria-labelledby="support-title"
        >
          <div>
            <p className={styles.kicker}>03 / Keep The Work Going</p>
            <h2 id="support-title">A Few Ways To Support Me</h2>
            <p>
              If a guide helped you find a starting point or a tool made your
              research easier, you can support what I’m building.
            </p>
            <p className={styles.small}>
              Support helps my work. It is not automatically added to the
              investment balance shown above.
            </p>
          </div>
          <div className={styles.linkTree}>
            <a
              href={coffeeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.supportLink}
            >
              <span className={styles.linkIcon}>
                <Icon kind="coffee" />
              </span>
              <span>
                <strong>Buy Me A Coffee</strong>
                <small>A Small Thank You For The Tools And Guides</small>
              </span>
              <span className={styles.linkArrow}>
                <Icon kind="arrow" />
              </span>
            </a>
            {referralUrl ? (
              <div>
                <a
                  href={referralUrl}
                  target="_blank"
                  rel="sponsored noopener noreferrer"
                  className={styles.supportLink}
                >
                  <span className={styles.linkIcon}>
                    <Icon kind="leaf" />
                  </span>
                  <span>
                    <strong>My Robinhood Referral</strong>
                    <small>Explore Robinhood Through My Link</small>
                  </span>
                  <span className={styles.linkArrow}>
                    <Icon kind="arrow" />
                  </span>
                </a>
                <p className={styles.referralNote}>
                  Referral Disclosure: I may receive a reward if you sign up and
                  meet Robinhood’s requirements. Review the current offer and
                  terms on Robinhood.
                </p>
              </div>
            ) : (
              <div className={`${styles.supportLink} ${styles.comingSoon}`}>
                <span className={styles.linkIcon}>
                  <Icon kind="leaf" />
                </span>
                <span>
                  <strong>My Robinhood Referral</strong>
                  <small>Link Coming Soon</small>
                </span>
              </div>
            )}
            <Link
              href="/resources/phd-essay-bundle"
              className={styles.supportLink}
            >
              <span className={styles.linkIcon}>
                <Icon kind="code" />
              </span>
              <span>
                <strong>My PhD Application Essays</strong>
                <small>Two Essays And A Reading Note · $5</small>
              </span>
              <span className={styles.linkArrow}>
                <Icon kind="arrow" />
              </span>
            </Link>
          </div>
        </section>
        <p className={styles.disclosure}>
          This page documents my own investing. It is not a recommendation to
          buy or sell any security. Investments can lose value, and reaching the
          goal is not guaranteed. Account growth is not the same as investment
          return.
        </p>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  res,
}) => {
  res.setHeader('Cache-Control', 'public, s-maxage=300');
  return {
    props: {
      referralUrl: publicHttpsLink(process.env.ROBINHOOD_REFERRAL_URL, [
        'robinhood.com',
        'join.robinhood.com',
        'robinhood.app.link',
      ]),
      coffeeUrl: 'https://buymeacoffee.com/prameshsharma',
    },
  };
};

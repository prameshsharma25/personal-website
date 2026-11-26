import { useEffect, useState } from 'react';
import { emptySubstackStats, type SubstackStats } from '../lib/substack-stats';
import styles from '../styles/SubstackStats.module.css';

const metrics = [
  ['likes', 'Likes'],
  ['comments', 'Comments'],
  ['restacks', 'Restacks'],
] as const;

export default function SubstackPostStats({
  slug,
  url,
}: {
  slug: string;
  url: string;
}) {
  const [result, setResult] = useState<{
    slug: string;
    stats: SubstackStats;
  } | null>(null);
  const stats = result?.slug === slug ? result.stats : null;
  useEffect(() => {
    let request: AbortController | null = null;
    const refresh = () => {
      if (document.hidden) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      void fetch(`/api/substack-stats?slug=${encodeURIComponent(slug)}`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error('Statistics unavailable');
          return response.json() as Promise<SubstackStats>;
        })
        .then((value) => {
          if (!controller.signal.aborted) setResult({ slug, stats: value });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResult({ slug, stats: emptySubstackStats() });
        });
    };
    refresh();
    const interval = setInterval(refresh, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      request?.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [slug]);

  return (
    <section className={styles.panel} aria-label="Substack Reader Activity">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>On Substack</p>
          <h2>Reader Activity</h2>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer">
          Join The Discussion <span aria-hidden="true">↗</span>
        </a>
      </div>
      {!stats ? (
        <p className={styles.note} role="status">
          Loading Substack Activity…
        </p>
      ) : stats.status === 'unavailable' ? (
        <p className={styles.note} role="status">
          Activity counts are unavailable right now. You can still join the
          discussion on Substack.
        </p>
      ) : (
        <>
          <dl className={styles.metrics}>
            {metrics.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {stats[key] === null ? (
                    <span className={styles.missing}>Not Available</span>
                  ) : (
                    new Intl.NumberFormat('en-US').format(stats[key]!)
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className={styles.note}>
            {stats.status === 'stale'
              ? 'Showing the last available counts. '
              : 'Public activity on this post’s Substack version. '}
            {stats.checkedAt && (
              <>
                Updated{' '}
                <time dateTime={stats.checkedAt}>
                  {new Date(stats.checkedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'UTC',
                  })}{' '}
                  UTC
                </time>
                .{' '}
              </>
            )}
            Counts refresh about hourly.
          </p>
        </>
      )}
    </section>
  );
}

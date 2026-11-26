import { useEffect, useState } from 'react';
import { emptySubstackViews, type SubstackViews } from '../lib/substack-views';
import styles from '../styles/SubstackStats.module.css';

export default function SubstackRecentViews({ slug }: { slug: string }) {
  const [result, setResult] = useState<{
    slug: string;
    stats: SubstackViews;
  } | null>(null);
  const stats = result?.slug === slug ? result.stats : null;
  useEffect(() => {
    let request: AbortController | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (document.hidden) return;
      request?.abort();
      if (timeout) clearTimeout(timeout);
      const controller = new AbortController();
      request = controller;
      timeout = setTimeout(() => {
        controller.abort();
        setResult({ slug, stats: emptySubstackViews() });
      }, 25_000);
      void fetch(`/api/substack-views?slug=${encodeURIComponent(slug)}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then((response) => {
          if (!response.ok) throw new Error('Recent views unavailable');
          return response.json() as Promise<SubstackViews>;
        })
        .then((value) => {
          if (!controller.signal.aborted) setResult({ slug, stats: value });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResult({ slug, stats: emptySubstackViews() });
        })
        .finally(() => {
          if (request === controller && timeout) clearTimeout(timeout);
        });
    };
    refresh();
    const interval = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      request?.abort();
      if (timeout) clearTimeout(timeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [slug]);

  if (!stats || stats.status === 'disabled') return null;
  return (
    <div
      className={styles.recentViews}
      role="group"
      aria-label="Substack Recent Web Views"
    >
      <div className={styles.viewCount}>
        <span className={styles.viewLabel}>Views In The Past 30 Minutes</span>
        {stats.status === 'available' && stats.views !== null ? (
          <strong>{new Intl.NumberFormat('en-US').format(stats.views)}</strong>
        ) : (
          <span className={styles.missing}>Currently Unavailable</span>
        )}
      </div>
      <p className={styles.note}>
        {stats.status === 'available' ? (
          <>
            Tracked visits to this post on Substack’s website, including repeat
            visits. Refreshes about every minute.
            {stats.checkedAt && (
              <>
                {' '}
                Checked{' '}
                <time dateTime={stats.checkedAt}>
                  {new Date(stats.checkedAt).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'UTC',
                  })}{' '}
                  UTC
                </time>
                .
              </>
            )}
          </>
        ) : (
          'Recent web views are unavailable right now.'
        )}{' '}
        Email and app reading are not included. This is separate from Substack’s
        total views.
      </p>
    </div>
  );
}

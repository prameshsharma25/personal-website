import { useEffect, useState } from 'react';
import { emptyWebsiteViews, type WebsiteViews } from '../lib/website-views';
import {
  websiteViewSession,
  rememberWebsiteView,
} from '../lib/website-view-session';
import styles from '../styles/WebsiteViews.module.css';

export default function WebsitePostViews({ slug }: { slug: string }) {
  const [result, setResult] = useState<{
    slug: string;
    data: WebsiteViews;
  } | null>(null);
  const stats = result?.slug === slug ? result.data : null;
  useEffect(() => {
    let disposed = false;
    let enabled = false;
    let controller: AbortController | null = null;
    let delay: ReturnType<typeof setTimeout> | null = null;
    async function refresh() {
      if (document.hidden || controller || disposed) return;
      let session = enabled ? websiteViewSession(slug) : null;
      const current = new AbortController();
      controller = current;
      const timeout = setTimeout(() => current.abort(), 8000);
      try {
        async function request() {
          const record = session && !session.seen;
          const response = await fetch(
            `/api/website-views?slug=${encodeURIComponent(slug)}`,
            {
              method: record ? 'POST' : 'GET',
              ...(record
                ? {
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session: session.id }),
                  }
                : {}),
              signal: current.signal,
            }
          );
          if (!response.ok) throw new Error('Views unavailable');
          return (await response.json()) as WebsiteViews;
        }
        let data = await request();
        // Do not create a session identifier while the counter is disabled.
        if (!disposed && !enabled && data.status === 'available') {
          enabled = true;
          session = websiteViewSession(slug);
          if (session && !session.seen) data = await request();
        }
        enabled = data.status === 'available';
        if (!disposed) {
          if (session && data.status === 'available' && data.recorded)
            rememberWebsiteView(slug, session.id);
          setResult({ slug, data });
        }
      } catch {
        if (!disposed) setResult({ slug, data: emptyWebsiteViews() });
      } finally {
        clearTimeout(timeout);
        if (controller === current) controller = null;
      }
    }
    function visible() {
      if (delay) clearTimeout(delay);
      // Run only on a mounted, visible article. Next.js link prefetch is not a view.
      if (!document.hidden) delay = setTimeout(() => void refresh(), 300);
    }
    visible();
    const interval = setInterval(() => void refresh(), 60_000);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      controller?.abort();
      if (delay) clearTimeout(delay);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [slug]);
  if (!stats || stats.status === 'disabled') return null;
  return (
    <section className={styles.panel} aria-label="Website Views">
      <div>
        <h2>Website Views</h2>
        {stats.status === 'available' && stats.views !== null ? (
          <strong>{new Intl.NumberFormat('en-US').format(stats.views)}</strong>
        ) : (
          <span className={styles.missing}>Currently Unavailable</span>
        )}
      </div>
      <p>
        Views of this article on prameshsharma.com since tracking began. Repeat
        opens in the same tab session count once.
      </p>
    </section>
  );
}

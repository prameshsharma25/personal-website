import { useEffect, useState } from 'react';
import ChoiceGroup from './ChoiceGroup';
import YouTubeViewsChart from './YouTubeViewsChart';
import YouTubeVideoFeature from './YouTubeVideoFeature';
import YouTubeResearchCards from './YouTubeResearchCards';
import {
  YOUTUBE_CHANNEL_URL,
  type YouTubeFeed,
  type YouTubeAnalytics,
} from '../lib/youtube';
import ui from '../styles/Interface.module.css';
import styles from '../styles/YouTube.module.css';

const number = (value: number) => new Intl.NumberFormat('en-US').format(value);
const date = (value: string) =>
  new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function YouTubeSection({
  initialFeed,
}: {
  initialFeed: YouTubeFeed;
}) {
  const [feed, setFeed] = useState(initialFeed);
  const [selected, setSelected] = useState(initialFeed.videos[0]?.id ?? '');
  const video =
    feed.videos.find((item) => item.id === selected) ?? feed.videos[0];
  const videoId = video?.id;
  const [days, setDays] = useState('28');
  const [response, setResponse] = useState<{
    key: string;
    data: YouTubeAnalytics | null;
    error: boolean;
  } | null>(null);
  const matching = response?.key === `${videoId}:${days}`;
  const report = matching ? response.data : null;
  const loading = !!videoId && !matching;
  const failed = matching && response.error;
  const [term, setTerm] = useState('computational biology');
  useEffect(() => {
    let controller: AbortController | null = null;
    const refresh = () => {
      if (document.hidden) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      void fetch('/api/youtube', { signal: request.signal })
        .then((response) => {
          if (!response.ok) throw new Error('Unavailable');
          return response.json();
        })
        .then((next: YouTubeFeed) => {
          if (!request.signal.aborted) setFeed(next);
        })
        .catch(() => {});
    };
    // Refresh on arrival and when the tab returns; shared server caching bounds
    // upstream requests. No per-viewer tracking or local view-count estimates.
    refresh();
    const interval = setInterval(refresh, 900000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller?.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => {
    setResponse(null);
    if (!videoId) return;
    const controller = new AbortController();
    const key = `${videoId}:${days}`;
    void fetch(`/api/youtube?video=${videoId}&days=${days}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Unavailable');
        return response.json();
      })
      .then((data: YouTubeAnalytics) => {
        if (!controller.signal.aborted)
          setResponse({ key, data, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResponse({ key, data: null, error: true });
      });
    return () => controller.abort();
  }, [videoId, days]);
  const ready = report?.status === 'available';
  const daily = ready ? report.daily : null;
  const summary = ready ? report.summary : null;
  const search = ready ? report.searchTerms : null;
  const unavailable = loading
    ? 'Loading Channel Analytics…'
    : report?.status === 'not_connected'
      ? 'Daily viewing trends and search terms will appear once channel analytics are connected.'
      : 'Channel analytics are temporarily unavailable. Please check back later.';
  return (
    <section
      id="videos"
      className={`${ui.section} ${styles.section}`}
      aria-label="YouTube Videos"
    >
      <div className={styles.heading}>
        <div>
          <p className={ui.miniLabel}>On YouTube</p>
          <h2>Life Around The Lab.</h2>
          <p>
            A closer look at my days in research, and what I’m learning along
            the way.
          </p>
        </div>
        <a
          className={ui.textLink}
          href={YOUTUBE_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Visit My Channel <span aria-hidden="true">↗</span>
        </a>
      </div>
      {video ? (
        <>
          <div className={styles.videoLayout}>
            <YouTubeVideoFeature key={video.id} video={video} />
            <aside
              className={styles.snapshot}
              aria-label="Latest YouTube Counts"
            >
              <p className={ui.miniLabel}>Latest YouTube Count</p>
              <strong className={styles.viewCount}>
                {video.views == null ? 'Not Available' : number(video.views)}
              </strong>
              <span>Total Views</span>
              <p className={styles.caption}>
                Refreshed about every 15 minutes. YouTube may update its
                underlying count later.
              </p>
              {feed.checkedAt && (
                <p className={styles.caption}>
                  {feed.status === 'stale'
                    ? 'Last Successful Check:'
                    : 'Checked:'}{' '}
                  <time dateTime={feed.checkedAt}>
                    {new Date(feed.checkedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: 'UTC',
                    })}{' '}
                    UTC
                  </time>
                </p>
              )}
              {feed.status === 'unavailable' && (
                <p className={styles.caption}>
                  The public count is unavailable right now. The video can still
                  be watched on YouTube.
                </p>
              )}
              <label className={styles.selectLabel}>
                Recent Videos
                <select
                  value={video.id}
                  onChange={(event) => {
                    setSelected(event.target.value);
                  }}
                >
                  {feed.videos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className={styles.caption}>
                New public uploads appear automatically. Explore the full
                archive on my channel.
              </p>
            </aside>
          </div>
          <div className={styles.analyticsHeader}>
            <div>
              <p className={ui.miniLabel}>Behind The Views</p>
              <h3>Video Analytics</h3>
            </div>
            <ChoiceGroup
              label="Video Analytics Date Range"
              value={days}
              onChange={setDays}
              options={[
                { value: '28', label: '28 Days' },
                { value: '90', label: '90 Days' },
              ]}
            />
          </div>
          {(!ready || failed) && (
            <p className={styles.availability} role="status">
              {unavailable}
            </p>
          )}
          {ready && (
            <div aria-label="Video Analytics Results">
              <p className={styles.caption}>
                {date(report.startDate)} to {date(report.endDate)}. YouTube
                reports can lag behind the requested date range.
              </p>
              {summary && (
                <dl className={styles.metrics}>
                  <div>
                    <dt>Views In This Period</dt>
                    <dd>{number(summary.views)}</dd>
                  </div>
                  <div>
                    <dt>Watch Time</dt>
                    <dd>
                      {number(
                        Math.round((summary.minutesWatched / 60) * 10) / 10
                      )}{' '}
                      <small>Hours</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Average View Duration</dt>
                    <dd>
                      {Math.floor(summary.averageSeconds / 60)}:
                      {String(Math.floor(summary.averageSeconds % 60)).padStart(
                        2,
                        '0'
                      )}
                    </dd>
                  </div>
                </dl>
              )}
              {!summary && (
                <p className={styles.caption}>
                  Summary measurements are not available for this period.
                </p>
              )}
              <div className={styles.reportGrid}>
                <div className={styles.reportPanel}>
                  <h4>Views Over Time</h4>
                  {daily?.length ? (
                    <YouTubeViewsChart
                      key={`${videoId}:${days}:${report.checkedAt}`}
                      report={report}
                    />
                  ) : (
                    <p>
                      {daily === null
                        ? 'Daily views are unavailable for this period.'
                        : 'YouTube has not returned daily measurements for this period.'}
                    </p>
                  )}
                </div>
                <div className={styles.reportPanel}>
                  <h4>YouTube Search Terms</h4>
                  <p className={styles.caption}>
                    Searches that led viewers to this video.
                  </p>
                  {search?.length ? (
                    <ol className={styles.searchTerms}>
                      {search.map((item) => (
                        <li key={item.term}>
                          <span>{item.term}</span>
                          <strong>
                            {number(item.views)} <small>Views</small>
                          </strong>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>
                      {search === null
                        ? 'Search term data is unavailable for this period.'
                        : 'YouTube has not shared search terms for this period. Low volume can limit this report.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className={styles.contextGrid}>
            <div>
              <h4>Explore Search Interest</h4>
              <p>
                See how interest in a topic changes across YouTube searches.
                This is broader than traffic to my channel.
              </p>
              <label className={styles.selectLabel}>
                Search Topic
                <input
                  type="search"
                  value={term}
                  maxLength={80}
                  onChange={(event) => setTerm(event.target.value)}
                />
              </label>
              <a
                className={ui.textLink}
                href={`https://trends.google.com/trends/explore?date=today%2012-m&gprop=youtube&q=${encodeURIComponent(term.trim() || 'computational biology')}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Explore On Google Trends <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div>
              <h4>About These Numbers</h4>
              <p>
                The public count shows total views, not people watching right
                now. Daily analytics are reported by YouTube for the selected
                video and period.
              </p>
              <p>
                Returning viewers and YouTube Studio’s realtime estimates are
                not exposed by the APIs used here. Missing measurements are
                shown as unavailable.
              </p>
              <a
                className={ui.textLink}
                href="https://developers.google.com/youtube/analytics/metrics"
                target="_blank"
                rel="noopener noreferrer"
              >
                YouTube Metric Definitions <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <YouTubeResearchCards videoId={video.id} />
        </>
      ) : (
        <p className={styles.availability}>
          There are no public videos in the channel feed right now.
        </p>
      )}
    </section>
  );
}

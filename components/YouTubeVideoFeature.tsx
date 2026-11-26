import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { YouTubeVideo } from '../lib/youtube';
import {
  chapterEmbedUrl,
  chapterShareUrl,
  chapterTime,
  videoCompanion,
  type VideoChapter,
} from '../lib/youtube-companions';
import ui from '../styles/Interface.module.css';
import styles from '../styles/YouTube.module.css';

export default function YouTubeVideoFeature({
  video,
}: {
  video: YouTubeVideo;
}) {
  const companion = videoCompanion(video.id);
  const [playback, setPlayback] = useState<{
    start: number;
    request: number;
  } | null>(null);
  const [fallbackPoster, setFallbackPoster] = useState(false);
  const [share, setShare] = useState<{
    chapter: string;
    url: string;
    copied: boolean;
  } | null>(null);
  const copyRequest = useRef(0);
  useEffect(
    () => () => {
      copyRequest.current++;
    },
    []
  );

  function play(start: number) {
    setPlayback((previous) => ({
      start,
      request: (previous?.request ?? 0) + 1,
    }));
  }
  async function copyChapter(chapter: VideoChapter) {
    const request = ++copyRequest.current;
    const url = chapterShareUrl(video.id, chapter.start);
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      /* A selectable link remains available when clipboard access is blocked. */
    }
    if (request === copyRequest.current)
      setShare({ chapter: chapter.title, url, copied });
  }

  return (
    <div className={styles.feature}>
      <div className={styles.player}>
        {playback ? (
          <iframe
            key={playback.request}
            src={chapterEmbedUrl(video.id, playback.start)}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            className={styles.play}
            onClick={() => play(0)}
            aria-label={`Play ${video.title}`}
          >
            <Image
              src={`https://i.ytimg.com/vi/${video.id}/${fallbackPoster ? 'hqdefault' : 'maxresdefault'}.jpg`}
              onError={() => setFallbackPoster(true)}
              alt=""
              fill
              sizes="(max-width: 760px) 90vw, (max-width: 1100px) 62vw, 650px"
              className={styles.poster}
            />
            <span className={styles.playIcon} aria-hidden="true">
              ▶
            </span>
            <span className={styles.playLabel}>Watch The Video</span>
          </button>
        )}
      </div>
      <div className={styles.videoTitle}>
        <h3>{video.title}</h3>
        <time dateTime={video.publishedAt}>
          {new Date(video.publishedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </time>
      </div>
      <a
        className={ui.textLink}
        href={`https://www.youtube.com/watch?v=${video.id}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Watch On YouTube <span aria-hidden="true">↗</span>
      </a>
      {!!companion?.chapters.length && (
        <section className={styles.chapters} aria-label="Video Chapters">
          <div className={styles.companionHeading}>
            <h4>Explore The Video</h4>
            <span>
              {companion.chapters.length} Chapters ·{' '}
              {chapterTime(companion.durationSeconds)}
            </span>
          </div>
          <p className={styles.caption}>
            Jump to a moment, or copy its link to share.
          </p>
          <ol className={styles.chapterList}>
            {companion.chapters.map((chapter) => (
              <li key={chapter.start}>
                <button
                  type="button"
                  className={styles.chapterJump}
                  aria-label={`Play Chapter: ${chapter.title} (${chapterTime(chapter.start)})`}
                  aria-pressed={playback?.start === chapter.start}
                  onClick={() => play(chapter.start)}
                >
                  <span className={styles.chapterTime}>
                    {chapterTime(chapter.start)}
                  </span>
                  <span>{chapter.title}</span>
                </button>
                <button
                  type="button"
                  className={styles.chapterShare}
                  aria-label={`Copy Link To ${chapter.title}`}
                  title={`Copy Link To ${chapter.title}`}
                  onClick={() => void copyChapter(chapter)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                  </svg>
                </button>
              </li>
            ))}
          </ol>
          {share && (
            <div className={styles.chapterShareResult}>
              <p className={styles.caption} role="status">
                {share.copied
                  ? `Link copied for ${share.chapter}.`
                  : 'Copy the chapter link below.'}
              </p>
              {!share.copied && (
                <label className={styles.selectLabel}>
                  Chapter Link
                  <input
                    type="text"
                    readOnly
                    value={share.url}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
              )}
              <a
                className={ui.textLink}
                href={share.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open This Moment On YouTube <span aria-hidden="true">↗</span>
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

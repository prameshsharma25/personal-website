import Link from 'next/link';
import { videoCompanion } from '../lib/youtube-companions';
import styles from '../styles/YouTube.module.css';

export default function YouTubeResearchCards({ videoId }: { videoId: string }) {
  const resources = videoCompanion(videoId)?.resources;
  if (!resources?.length) return null;
  return (
    <section
      className={styles.researchCompanion}
      aria-label="Related Research And Resources"
    >
      <div className={styles.companionHeading}>
        <h3>Go A Little Deeper.</h3>
      </div>
      <p className={styles.caption}>
        Explore the research, try a tool, or read how I found my way into the
        lab.
      </p>
      <div className={styles.researchCards}>
        {resources.map((resource) => (
          <Link
            key={resource.href}
            href={resource.href}
            className={styles.researchCard}
          >
            <span className={styles.resourceCategory}>{resource.category}</span>
            <h4>{resource.title}</h4>
            <p>{resource.description}</p>
            <span className={styles.resourceAction}>
              {resource.action}
              <span aria-hidden="true">↗</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

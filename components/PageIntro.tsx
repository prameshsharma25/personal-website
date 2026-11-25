import type { ReactNode } from 'react';
import styles from '../styles/Interface.module.css';

export default function PageIntro({
  eyebrow,
  title,
  accent,
  description,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  description: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className={`${styles.intro} ${aside ? styles.splitIntro : ''}`}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>
          <span>{title}</span>
          {accent && (
            <>
              {' '}
              <span className={styles.accent}>{accent}</span>
            </>
          )}
        </h1>
        <div className={styles.description}>{description}</div>
        {children}
      </div>
      {aside && <aside className={styles.aside}>{aside}</aside>}
    </header>
  );
}

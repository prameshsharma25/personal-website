import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from '../styles/PortfolioShortcut.module.css';

const VISITED_KEY = 'portfolio-shortcut-visited';
// Retain the choice across route remounts even when browser storage is blocked.
let visitedInThisTab = false;

export default function PortfolioShortcut({ active }: { active: boolean }) {
  const [jitter, setJitter] = useState(false);
  useEffect(() => {
    try {
      visitedInThisTab ||= localStorage.getItem(VISITED_KEY) === '1';
    } catch {
      /* The tab still remembers activation without storage. */
    }
    setJitter(!visitedInThisTab);
    const sync = (event: StorageEvent) => {
      if (event.key === VISITED_KEY && event.newValue === '1') {
        visitedInThisTab = true;
        setJitter(false);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function stopJitter() {
    visitedInThisTab = true;
    setJitter(false);
    try {
      localStorage.setItem(VISITED_KEY, '1');
    } catch {
      /* Navigation and the in-tab preference still work. */
    }
  }

  return (
    <Link
      href="/road-to-10000"
      className={`${styles.shortcut}${jitter ? ` ${styles.jitter}` : ''}`}
      onClick={stopJitter}
      onAuxClick={(event) => {
        if (event.button === 1) stopJitter();
      }}
      aria-label="Road To $10,000"
      aria-current={active ? 'page' : undefined}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" className={styles.mark}>
        <circle cx="32" cy="32" r="27" className={styles.ring} />
        <path d="M13 42h7l6-5 7 2 12-13h7M46 26h6v6" className={styles.path} />
      </svg>
      <span className={styles.logo} aria-hidden="true">
        $10K
      </span>
      <span className={styles.tooltip} aria-hidden="true">
        Road To $10,000
      </span>
    </Link>
  );
}

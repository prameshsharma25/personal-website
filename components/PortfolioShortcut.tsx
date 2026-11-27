import Link from 'next/link';
import styles from '../styles/PortfolioShortcut.module.css';

export default function PortfolioShortcut({ active }: { active: boolean }) {
  return (
    <Link
      href="/road-to-10000"
      className={styles.shortcut}
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

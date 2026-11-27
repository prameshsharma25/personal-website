import Link from 'next/link';
import styles from '../styles/Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.content}>
          <p>&copy; 2026 Pramesh Sharma. All rights reserved.</p>
          <div className={styles.links}>
            <Link href="/resources" className={styles.link}>Resources</Link>
            <Link href="/road-to-10000" className={styles.link}>Road To $10,000</Link>
            <Link href="/research-opportunities" className={styles.link}>Lab Directory</Link>
            <Link href="/feed.xml" prefetch={false} className={styles.link}>RSS</Link>
            <Link href="/privacy" className={styles.link}>
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

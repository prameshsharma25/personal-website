import Link from 'next/link';
import styles from '../styles/Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.content}>
          <p>&copy; 2026 Pramesh Sharma. All rights reserved.</p>
          <div className={styles.links}>
            <Link href="/privacy" className={styles.link}>
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

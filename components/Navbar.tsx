import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from '../styles/Navbar.module.css';

const links = [
  { href: '/', label: 'Home' },
  { href: '/experience', label: 'About' },
  { href: '/posts', label: 'Posts' },
  { href: '/mentorship', label: 'Mentorship' },
  { href: '/books', label: 'Books' },
  { href: '/research-opportunities', label: 'PhD Opportunities' },
  { href: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const { pathname } = useRouter();

  return (
    <nav className={styles.navbar} aria-label="Main navigation">
      <div className={styles.container}>
        <div className={styles.logo}>
          <Link href="/" className={styles.logoLink}>Pramesh Sharma</Link>
        </div>
        <ul className={styles.navLinks}>
          {links.map(({ href, label }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`${styles.navLink} ${active ? styles.active : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

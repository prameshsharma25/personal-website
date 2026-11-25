import { NEWSLETTER_URL } from '../lib/newsletter';
import ActionLink from './ActionLink';
import styles from '../styles/Resources.module.css';

export default function NewsletterInvitation({ source }: { source: string }) {
  if (!NEWSLETTER_URL) return null;
  return <section className={styles.newsletter} aria-label="Newsletter signup">
    <h2>Get new posts by email.</h2>
    <p>I share research updates and what I’m learning along the way. Sign up to get new posts in your inbox.</p>
    <ActionLink href={NEWSLETTER_URL} event="newsletter_click" source={source} className={styles.secondaryButton}>Subscribe →</ActionLink>
    <p className={styles.small}>You can unsubscribe at any time.</p>
  </section>;
}

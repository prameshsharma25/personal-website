import NewsletterForm from './NewsletterForm';
import { useNewsletterAvailable } from './NewsletterProvider';
import styles from '../styles/Resources.module.css';
export default function NewsletterInvitation({ source }: { source: string }) {
  const available = useNewsletterAvailable();
  if (!available) return null;
  return <section className={styles.newsletter} aria-label="Newsletter signup">
    <h2>Get new posts by email.</h2>
    <p>I share research updates and what I’m learning along the way.</p>
    <NewsletterForm source={source} />
  </section>;
}

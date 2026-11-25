import ActionLink from './ActionLink';
import { useNewsletterAvailable } from './NewsletterProvider';
import { NEWSLETTER_URL } from '../lib/newsletter';
import styles from '../styles/Resources.module.css';

export default function LabTrackerInvitation({ source }: { source: string }) {
  const available = useNewsletterAvailable();
  return <aside className={styles.callout} aria-label="Free lab-search tracker">
    <p className={styles.eyebrow}>FREE DOWNLOAD</p>
    <h2>Keep your lab search organized.</h2>
    <p>A spreadsheet for the labs you’re considering, the people you’ve contacted, and when to follow up.</p>
    <div className={styles.actions}>
      <ActionLink href="/resources/lab-search-tracker" event="tracker_invitation_click" source={source} className={styles.primaryButton}>Get the lab-search tracker →</ActionLink>
      {available && <ActionLink href={NEWSLETTER_URL} event="newsletter_click" source={source} className={styles.textLink}>Get new posts by email ↗</ActionLink>}
    </div>
  </aside>;
}

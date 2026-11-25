import ActionLink from './ActionLink';
import { NEWSLETTER_URL } from '../lib/site';
import styles from '../styles/Resources.module.css';
export default function LabTrackerInvitation({ source }: { source: string }) {
  return <aside className={styles.callout} aria-label="Free lab-search tracker">
    <p className={styles.eyebrow}>FREE DOWNLOAD</p><h2>Turn your reading into a lab shortlist.</h2><p>Keep labs, papers, outreach, and follow-ups together in a simple spreadsheet.</p>
    <div className={styles.actions}><ActionLink href="/resources/lab-search-tracker" event="tracker_invitation_click" source={source} className={styles.primaryButton}>Get the lab-search tracker →</ActionLink><ActionLink href={NEWSLETTER_URL} event="newsletter_click" source={source} className={styles.textLink}>Get new posts by email ↗</ActionLink></div>
  </aside>;
}

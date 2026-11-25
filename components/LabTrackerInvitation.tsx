import ActionLink from './ActionLink';
import styles from '../styles/Resources.module.css';

export default function LabTrackerInvitation({ source }: { source: string }) {
  return <aside className={styles.callout} aria-label="Free lab-search tracker">
    <p className={styles.eyebrow}>FREE DOWNLOAD</p>
    <h2>Keep your lab search organized.</h2>
    <p>A spreadsheet for the labs you’re considering, the people you’ve contacted, and when to follow up.</p>
    <div className={styles.actions}>
      <ActionLink href="/resources/lab-search-tracker" event="tracker_invitation_click" source={source} className={styles.primaryButton}>Get the lab-search tracker →</ActionLink>
    </div>
  </aside>;
}

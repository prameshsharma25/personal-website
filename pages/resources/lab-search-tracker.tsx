import Link from 'next/link';
import Seo from '../../components/Seo';
import ActionLink from '../../components/ActionLink';
import { TRACKER_URL } from '../../lib/site';
import styles from '../../styles/Resources.module.css';
export default function LabSearchTracker() {
  return <><Seo title="Free Lab-Search Tracker for Research Applications" description="Download a free Excel lab-search tracker with a lab shortlist, outreach log, follow-up dates, and mentor-fit worksheet. CSV and quick-start guide included." path="/resources/lab-search-tracker" image="/images/social/lab-search-tracker.png" breadcrumbs={[{name:'Home',path:'/'},{name:'Resources',path:'/resources'},{name:'Lab-Search Tracker',path:'/resources/lab-search-tracker'}]} />
    <main className={`${styles.page} ${styles.narrow}`}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/resources">Resources</Link><span>/ Lab-Search Tracker</span></nav>
      <p className={styles.eyebrow}>FREE DOWNLOAD / NO EMAIL REQUIRED</p><h1 className={styles.title}>Find a lab.<br />Keep the search organized.</h1><p className={styles.lead}>A simple place for the labs you’re considering, the papers that caught your attention, and the next conversation you want to have.</p>
      <div className={styles.actions}><ActionLink href={TRACKER_URL} download event="tracker_download" source="tracker_page" className={styles.primaryButton}>Download The Excel Tracker ↓</ActionLink><ActionLink href="/downloads/lab-search-tracker.zip" download event="tracker_bundle_download" source="tracker_page" className={styles.secondaryButton}>Get All Formats ↓</ActionLink></div>
      <p className={styles.small}>The ZIP includes the Excel workbook, CSV templates, and a PDF quick-start guide. Files stay on your device; this site does not receive your lab or contact records.</p>
      <div className={styles.grid}><section data-tilt data-reveal className={styles.card}><h2>A shortlist with a reason</h2><p>Record each lab, research theme, paper, application route, and a sentence about why you’re interested.</p></section><section data-tilt data-reveal className={styles.card}><h2>A clear next action</h2><p>Log outreach dates, replies, and follow-ups you choose. Compare mentor fit after conversations.</p></section></div>
      <section data-reveal className={styles.body}><h2>Start with three labs</h2><ol><li>Read the lab’s official recruitment page and a recent paper.</li><li>Add a specific research connection to the Lab Shortlist tab.</li><li>Use the Outreach Log to record your message and choose a follow-up date.</li><li>After a conversation, use Mentor Fit to reflect on supervision, training, and the work.</li></ol><p>The tracker is an organizer, not a list of openings. Check eligibility and availability with each program. It does not send emails or reminders.</p><p>Need help with the first message? Read my <Link href="/mentorship/cold-emailing">cold-email guide</Link> or the story of <Link href="/posts/how-i-found-an-nih-postbac-lab">how I found my NIH postbac lab</Link>.</p><h2>Use it in your preferred spreadsheet app</h2><p>The workbook is designed for Excel. For other apps, use the CSV templates as plain tables; CSV files do not include formatting, dropdowns, or formulas.</p></section>

    </main></>;
}

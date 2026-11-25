import { useState } from 'react';
import { NEWSLETTER_EMBED_URL, NEWSLETTER_URL } from '../lib/site';
import ActionLink, { recordAction } from './ActionLink';
import styles from '../styles/Resources.module.css';
export default function NewsletterInvitation({ source, embedded = false }: { source: string; embedded?: boolean }) {
  const [showForm, setShowForm] = useState(false);
  return <section className={styles.newsletter} aria-label="Newsletter signup">
    <p className={styles.eyebrow}>KEEP EXPLORING</p><h2>More notes from a path into research.</h2>
    <p>I write about research, career transitions, and the experiences behind them. Subscribe through Substack to receive new posts by email.</p>
    {embedded && !showForm && <button className={styles.secondaryButton} onClick={() => { setShowForm(true); recordAction('newsletter_form_open', source); }}>Open signup form</button>}
    {embedded && showForm && <iframe className={styles.signupFrame} src={NEWSLETTER_EMBED_URL} title="Subscribe to Pramesh Sharma on Substack" loading="lazy" />}
    <ActionLink href={NEWSLETTER_URL} event="newsletter_click" source={source} className={styles.textLink}>Subscribe on Substack ↗</ActionLink>
    <p className={styles.small}>Signup is optional. Substack handles your subscription, and you can unsubscribe at any time.</p>
  </section>;
}

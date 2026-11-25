import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import styles from '../styles/Newsletter.module.css';
export default function NewsletterForm({ source }: { source: string }) {
  const id = useId();
  const [email, setEmail] = useState(''), [consent, setConsent] = useState(false), [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  async function subscribe(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/newsletter/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, consent, website, source }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Signup could not be completed.');
      setMessage(data.message); setEmail(''); setConsent(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  if (message) return <p role="status" className={styles.success}>{message}</p>;
  return <form onSubmit={subscribe} className={styles.form}>
    <label htmlFor={`${id}-email`}>Email address</label>
    <div className={styles.signupRow}>
      <input id={`${id}-email`} type="email" name="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
      <button type="submit" disabled={busy}>{busy ? 'Signing up…' : 'Subscribe'}</button>
    </div>
    <div className={styles.honeypot} aria-hidden="true"><label htmlFor={`${id}-website`}>Website</label><input id={`${id}-website`} name="website" value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" /></div>
    <label className={styles.consent}><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />Email me new posts from Pramesh Sharma.</label>
    <p className={styles.note}>Confirm your email to join. Unsubscribe whenever you like. <Link href="/privacy">Privacy</Link></p>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </form>;
}

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Seo from './Seo';
import resource from '../styles/Resources.module.css';
import styles from '../styles/Newsletter.module.css';
export default function NewsletterTokenPage({ action }: { action: 'confirm' | 'unsubscribe' }) {
  const [token, setToken] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const confirming = action === 'confirm', storageKey = `newsletter-${action}-reference`;
  useEffect(() => {
    const value = new URLSearchParams(location.hash.slice(1)).get('token');
    try { if (value) sessionStorage.setItem(storageKey, value); setToken(value || sessionStorage.getItem(storageKey) || ''); }
    catch { setToken(value || ''); }
    if (location.hash) history.replaceState(null, '', location.pathname);
    setReady(true);
  }, [storageKey]);
  async function submit() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/newsletter/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Please try again.');
      setMessage(data.message);
      try { sessionStorage.removeItem(storageKey); } catch {}
    } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <><Seo title={confirming ? 'Confirm Your Subscription' : 'Unsubscribe'} description="Manage your subscription to new posts from Pramesh Sharma." path={`/newsletter/${action}`} noindex />
    <main className={`${resource.page} ${resource.narrow}`}>
      <h1 className={resource.title}>{confirming ? 'Confirm your subscription.' : 'Unsubscribe from my emails.'}</h1>
      {message ? <p className={styles.success} role="status">{message}</p> : <>
        <p className={resource.lead}>{confirming ? 'Click below to start receiving new posts from me.' : 'Click below to stop receiving newsletters. You don’t need to log in.'}</p>
        {ready && (token ? <button className={resource.primaryButton} onClick={submit} disabled={busy}>{busy ? 'Updating…' : confirming ? 'Confirm subscription' : 'Unsubscribe'}</button> : <p className={resource.status}>Open the link from your email to continue.</p>)}
      </>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.note}><Link href="/newsletter">Newsletter signup</Link> · <Link href="/contact">Contact me</Link></p>
    </main>
  </>;
}

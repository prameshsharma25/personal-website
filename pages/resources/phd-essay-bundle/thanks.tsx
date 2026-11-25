import { useEffect, useState } from 'react';
import Link from 'next/link';
import Seo from '../../../components/Seo';
import { ESSAY_PRODUCT } from '../../../lib/site';
import styles from '../../../styles/Resources.module.css';
export default function PurchaseDownload() {
  const [sessionId,setSessionId] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState(''), [downloaded,setDownloaded] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.hash.slice(1)).get('session_id');
    try {
      if (id) sessionStorage.setItem('essay-purchase-reference', id);
      setSessionId(id || sessionStorage.getItem('essay-purchase-reference') || '');
    } catch { setSessionId(id || ''); }
    if (id) window.history.replaceState(null,'',window.location.pathname);
  },[]);
  async function download() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/essay-download', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({sessionId}) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'The download could not be completed.'); }
      const blob = await response.blob(), url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = ESSAY_PRODUCT.filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url),60000); setDownloaded(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <><Seo title="Your Essay Bundle Download" description="Access the essay bundle after your purchase." path={`${ESSAY_PRODUCT.path}/thanks`} noindex />
    <main className={`${styles.page} ${styles.narrow}`}><p className={styles.eyebrow}>YOUR DIGITAL DOWNLOAD</p><h1 className={styles.title}>Your essay bundle.</h1><p className={styles.lead}>Use the button below to verify your payment and download the PDF, editable essays, and reading guide.</p>
      {sessionId ? <button className={styles.primaryButton} disabled={busy} onClick={download}>{busy ? 'Verifying Payment…' : 'Download My Essay Bundle ↓'}</button> : <p className={styles.status}>Open the download link in your purchase email, or return here directly from Stripe after payment.</p>}
      {downloaded && <p role="status" className={styles.status}>Your download is ready. Unzip the file and start with the reading guide.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.small}>Keep your purchase email to return to this download. Your access link is private. If your payment is still processing, wait a moment and try again.</p><p><Link className={styles.textLink} href="/contact">Need Help With Your Purchase?</Link></p>
    </main></>;
}

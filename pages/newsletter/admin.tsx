import { useEffect, useRef, useState, type FormEvent } from 'react';
import Seo from '../../components/Seo';
import type { NewsletterCampaign, NewsletterOverview } from '../../lib/newsletter';
import styles from '../../styles/Newsletter.module.css';

type Draft = { id: string; subject: string; body: string; articleUrl: string };
const emptyDraft = (): Draft => ({ id: '', subject: '', body: '', articleUrl: '' });
export default function NewsletterAdmin() {
  const [key, setKey] = useState(''), [overview, setOverview] = useState<NewsletterOverview | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft), [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false), [running, setRunning] = useState(false), [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [removeEmail, setRemoveEmail] = useState('');
  const pause = useRef(false);
  useEffect(() => () => { pause.current = true; }, []);
  const selected = overview?.campaigns.find(c => c.id === draft.id);
  const editable = !selected || selected.status === 'draft';
  const locked = busy || running;

  async function request(action: string, payload: Record<string, unknown> = {}): Promise<NewsletterOverview> {
    const response = await fetch('/api/newsletter/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Newsletter-Admin-Key': key }, body: JSON.stringify({ action, payload }), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The newsletter request failed.');
    setOverview(data); return data;
  }
  async function perform(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  function choose(campaign?: NewsletterCampaign) {
    setDraft(campaign ? { id: campaign.id, subject: campaign.subject, body: campaign.body, articleUrl: campaign.articleUrl } : emptyDraft());
    setDirty(false); setReviewed(false); setError(''); setNotice('');
  }
  function change(field: keyof Draft, value: string) { setDraft({ ...draft, [field]: value }); setDirty(true); setReviewed(false); }
  function unlock(event: FormEvent) { event.preventDefault(); void perform(async () => { await request('overview'); }); }
  async function save(event: FormEvent) {
    event.preventDefault();
    const next = { ...draft, id: draft.id || crypto.randomUUID() };
    setDraft(next); // Keep the same ID if the save response is interrupted.
    await perform(async () => { await request('saveDraft', next); setDirty(false); setReviewed(false); setNotice('Draft saved. Review the preview before sending.'); });
  }
  async function send() {
    if (!selected || dirty || (selected.status === 'draft' && !reviewed)) return;
    pause.current = false; setRunning(true); setError(''); setNotice('');
    try {
      let data = selected.status === 'draft' ? await request('approveCampaign', { id: selected.id }) : await request('overview');
      for (let batch = 0; batch < 100 && !pause.current; batch++) {
        const campaign = data.campaigns.find(c => c.id === selected.id);
        if (!campaign || campaign.status !== 'queued' || !campaign.queued || data.available < 1) break;
        data = await request('sendBatch', { id: selected.id });
        const updated = data.campaigns.find(c => c.id === selected.id);
        if (!updated || updated.queued >= campaign.queued || updated.uncertain > campaign.uncertain) break;
      }
      setNotice('Sending stopped. The counts below show what was sent and what remains.');
    } catch (err) {
      setError((err instanceof Error ? err.message : 'The send was interrupted.') + ' Refresh the status before resuming.');
    } finally { setRunning(false); }
  }
  function logout() { pause.current = true; setKey(''); setOverview(null); choose(); }

  return <><Seo title="Newsletter Admin" description="Private newsletter drafting and sending." path="/newsletter/admin" noindex />
    <main className={styles.admin}>
      <h1>Your newsletter</h1>
      {!overview ? <form onSubmit={unlock} className={styles.form}>
        <label htmlFor="admin-key">Admin access key</label>
        <input id="admin-key" className={styles.field} type="password" value={key} onChange={e => setKey(e.target.value)} autoComplete="off" required minLength={32} />
        <div className={styles.toolbar}><button type="submit" disabled={busy}>{busy ? 'Opening…' : 'Open dashboard'}</button></div>
        <p className={styles.note}>The key stays in this tab and is cleared when you leave or log out.</p>
      </form> : <>
        <p className={styles.note}>Sending as {overview.sender}</p>
        <div className={styles.toolbar}>
          <button className={`${styles.button} ${styles.secondary}`} disabled={locked} onClick={() => void perform(async () => { await request('overview'); })}>Refresh status</button>
          <button className={`${styles.button} ${styles.secondary}`} disabled={locked} onClick={logout}>Log out</button>
        </div>
        <dl className={styles.stats}>
          <div><dt>Confirmed subscribers</dt><dd>{overview.confirmed}</dd></div>
          <div><dt>Awaiting confirmation</dt><dd>{overview.pending}</dd></div>
          <div><dt>Unsubscribed</dt><dd>{overview.unsubscribed}</dd></div>
          <div><dt>Available newsletter sends</dt><dd>{overview.available}</dd></div>
        </dl>
        <details>
          <summary>Stop emails to an address</summary>
          <form className={styles.form} onSubmit={event => { event.preventDefault(); void perform(async () => { await request('suppressSubscriber', { email: removeEmail }); setRemoveEmail(''); setNotice('That address will not receive further newsletters unless it signs up and confirms again.'); }); }}>
            <p className={styles.note}>Use this for a bounced address or a reader who asks you to unsubscribe them. Queued emails to that address will be skipped.</p>
            <label htmlFor="remove-email">Email address to unsubscribe</label>
            <div className={styles.signupRow}><input id="remove-email" type="email" value={removeEmail} onChange={event => setRemoveEmail(event.target.value)} required maxLength={254} disabled={locked} /><button type="submit" disabled={locked}>Stop emails</button></div>
          </form>
        </details>
        {!overview.footerReady && <p className={styles.error}>Add SENDER_POSTAL_ADDRESS in Google Apps Script settings before sending a preview or newsletter.</p>}
        <section aria-labelledby="drafts-heading">
          <h2 id="drafts-heading">Saved newsletters</h2>
          <div className={styles.campaigns}>{overview.campaigns.map(campaign =>
            <button key={campaign.id} className={`${styles.campaign} ${campaign.id === draft.id ? styles.selected : ''}`} disabled={locked} onClick={() => choose(campaign)}>
              {campaign.subject}<span>{campaign.status} · {campaign.sent} sent · {campaign.queued} remaining · {campaign.uncertain} need review</span>
            </button>
          )}</div>
          <button className={`${styles.button} ${styles.secondary}`} disabled={locked} onClick={() => choose()}>New newsletter</button>
        </section>
        <div className={styles.editor}>
          <form onSubmit={save}>
            <h2>{editable ? 'Write a newsletter' : 'Saved newsletter'}</h2>
            <label htmlFor="subject">Subject</label><input className={styles.field} id="subject" value={draft.subject} onChange={e => change('subject', e.target.value)} disabled={!editable || locked} maxLength={120} required />
            <label htmlFor="body">Message</label><textarea className={styles.field} id="body" value={draft.body} onChange={e => change('body', e.target.value)} disabled={!editable || locked} maxLength={10000} required />
            <label htmlFor="article-url">Link to a post on your website (optional)</label><input className={styles.field} id="article-url" type="url" value={draft.articleUrl} onChange={e => change('articleUrl', e.target.value)} disabled={!editable || locked} maxLength={2000} />
            {editable && <div className={styles.toolbar}><button className={styles.button} disabled={locked} type="submit">Save draft</button></div>}
          </form>
          <section className={styles.preview} aria-label="Newsletter preview">
            <h3>{draft.subject || 'Your subject'}</h3><p>{draft.body || 'Your message will appear here.'}</p>
            {draft.articleUrl && <p>Read the post →<br />{draft.articleUrl}</p>}
            <footer><p>Pramesh Sharma<br />{overview.senderAddress || 'Your sender address'}</p><p>You received this because you subscribed.<br /><u>Unsubscribe</u></p></footer>
          </section>
        </div>
        {selected && <section className={styles.review} aria-label="Send newsletter">
          <h2>{selected.status === 'draft' ? 'Review and send' : 'Delivery progress'}</h2>
          {dirty && <p className={styles.note}>Save your changes before previewing by email or sending.</p>}
          {selected.status === 'draft' && <>
            <p className={styles.note}>The email preview goes only to {overview.sender}.</p>
            <div className={styles.toolbar}><button className={`${styles.button} ${styles.secondary}`} disabled={locked || dirty || !overview.footerReady || overview.available < 1} onClick={() => void perform(async () => { await request('sendTest', { id: selected.id }); setNotice('Preview sent to your account.'); })}>Email me a preview</button></div>
            <label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={locked || dirty} />I’ve reviewed the saved draft and want to send it to {overview.confirmed} confirmed subscribers.</label>
          </>}
          {selected.status !== 'draft' && <p>{selected.sent} sent · {selected.queued} remaining · {selected.skipped} skipped · {selected.uncertain} need review</p>}
          {selected.uncertain > 0 && <p className={styles.note}>Some send results are uncertain. They will not be retried automatically. Check your sending account and delivery records before deciding whether to contact those readers again.</p>}
          <div className={styles.toolbar}>
            {['draft', 'queued'].includes(selected.status) && !running && <button className={styles.button} disabled={busy || dirty || !overview.footerReady || overview.available < 1 || (selected.status === 'draft' && (!reviewed || overview.confirmed < 1))} onClick={() => void send()}>{selected.status === 'draft' ? 'Approve and send newsletter' : 'Resume sending'}</button>}
            {running && <button className={styles.button} onClick={() => { pause.current = true; setNotice('Pausing after the current batch.'); }}>Pause after this batch</button>}
            {['queued', 'preparing'].includes(selected.status) && <button className={`${styles.button} ${styles.secondary}`} disabled={locked} onClick={() => void perform(async () => { await request('cancelCampaign', { id: selected.id }); setNotice('Remaining emails cancelled.'); })}>Cancel remaining emails</button>}
          </div>
          <p className={styles.note}>Sending uses batches of up to five. Closing this page pauses after the current batch; reopen it to resume. A sent count means Google accepted the message, not that it reached the inbox. Confirmation emails and previews also use the account’s daily quota.</p>
        </section>}
      </>}
      {notice && <p className={styles.success} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </main>
  </>;
}

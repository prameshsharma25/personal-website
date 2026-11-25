import Link from 'next/link';
import { useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Seo from '../../../components/Seo';
import { recordAction } from '../../../components/ActionLink';
import { ESSAY_PRODUCT, SITE_URL } from '../../../lib/site';
import { commerceConfig } from '../../../lib/commerce';
import styles from '../../../styles/Resources.module.css';

export default function EssayBundle({ available, cancelled }: { available: boolean; cancelled: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const checkoutKey = useRef('');
  async function buy() {
    setBusy(true); setError('');
    try {
      checkoutKey.current ||= crypto.randomUUID();
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type':'application/json', 'X-Checkout-Key':checkoutKey.current }, body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Checkout could not be opened.');
      if (typeof data.url !== 'string' || !data.url.startsWith('https://checkout.stripe.com/')) throw new Error('Checkout could not be opened.');
      recordAction('essay_checkout_open', 'essay_bundle');
      window.location.assign(data.url);
    } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); setBusy(false); }
  }
  return <><Seo title="PhD Statement of Purpose & Personal Statement Bundle — $5" description="Read Pramesh Sharma’s PhD statement of purpose and personal statement. A $5 bundle with PDF, editable DOCX files, and a reading guide. Personal examples." path={ESSAY_PRODUCT.path} image="/images/social/phd-essay-bundle.png" breadcrumbs={[{name:'Home',path:'/'},{name:'Resources',path:'/resources'},{name:'PhD essay bundle',path:ESSAY_PRODUCT.path}]} schema={{ '@type': 'Product', name: ESSAY_PRODUCT.name, description: ESSAY_PRODUCT.description, image: `${SITE_URL}/images/social/phd-essay-bundle.png`, ...(available ? { offers: { '@type':'Offer', price:'5.00', priceCurrency:'USD', availability:'https://schema.org/InStock', url:`${SITE_URL}${ESSAY_PRODUCT.path}` } } : {}) }} />
    <main className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/resources">Resources</Link><span>/ PhD essay bundle</span></nav>
      <p className={styles.eyebrow}>MY APPLICATION WRITING / DIGITAL DOWNLOAD</p><h1 className={styles.title}>The research.<br />The person behind it.</h1>
      <p className={styles.lead}>My PhD statement of purpose and personal statement, side by side. Two ways of explaining how I arrived at computational biology and the questions I want to pursue.</p>
      {cancelled && <p className={styles.status}>Checkout was cancelled. You can start again whenever you’re ready.</p>}
      <div className={styles.grid}>
        <section className={styles.card}><h2>My PhD Application Essays</h2><p className={styles.price}>$5 <span className={styles.small}>USD · one-time purchase</span></p><ul><li>Statement of purpose tailored to UMD’s CBBG concentration</li><li>Personal statement about chronic illness, computing, and patient advocacy</li><li>A combined PDF, two editable DOCX files, and a short reading guide</li></ul>
          {available ? <button className={styles.primaryButton} onClick={buy} disabled={busy}>{busy ? 'Opening secure checkout…' : 'Buy the essay bundle — $5'}</button> : <p className={styles.status}>The bundle is being prepared for sale. Checkout is not open yet.</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <p className={styles.small}>{available ? 'Pay securely with Stripe. Download after payment; a download link will also be emailed to your checkout address.' : 'Explore the contents and sample below. The free lab-search tracker is available now.'}</p>
        </section>
        <section className={styles.preview} aria-label="Short excerpt from the statement of purpose"><h3>A SHORT EXCERPT / STATEMENT OF PURPOSE</h3><p>“I want to investigate how sequence variation alters protein structure and molecular function, and how these changes propagate to cellular behavior and responses to treatment.”</p><p>— Pramesh Sharma</p><p className={styles.small}>The full essays are included in the paid download.</p></section>
      </div>
      <section className={`${styles.body} ${styles.narrow}`}><h2>What you can learn from the pair</h2><p>The statement of purpose follows my research experiences, the problems I worked on, and the questions I want to study next. The personal statement explores how living with Pyruvate Kinase Deficiency shaped my relationship with computing, writing, and patient advocacy.</p><p>Read them as two complementary examples: one develops a research direction, while the other explains the experiences and values behind it.</p><h2>A reference, in my own words</h2><p>These are examples from my application writing, not a claim of admission or an admissions formula. The statement of purpose includes a school-specific section for the University of Maryland. Research and manuscript details reflect the essays as written.</p><p>The essay wording is preserved in this edition. Use the examples to reflect on your own experiences; do not submit my writing as your own. The purchase is for your personal reading and study, without redistribution or resale.</p><h2>Download and support</h2><p>The bundle is a ZIP containing PDF and DOCX files. It includes no admissions review or personalized service. For download or purchase problems, <Link href="/contact">contact me</Link> with your receipt email. Never send payment-card details.</p><p>Prefer a free starting point? Try the <Link href="/resources/lab-search-tracker">lab-search tracker</Link> and <Link href="/mentorship/cold-emailing">research cold-email guide</Link>.</p></section>
    </main></>;
}
export const getServerSideProps: GetServerSideProps = async ({ query, res }) => {
  res.setHeader('Cache-Control','private, no-store');
  return { props: { available: Boolean(commerceConfig()), cancelled: query.checkout === 'cancelled' } };
};

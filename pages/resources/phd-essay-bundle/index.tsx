import Link from 'next/link';
import { useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Seo from '../../../components/Seo';
import { recordAction } from '../../../components/ActionLink';
import { ESSAY_PRODUCT, SITE_URL } from '../../../lib/site';
import { commerceConfig } from '../../../lib/commerce';
import { gumroadProductUrl } from '../../../lib/gumroad';
import resource from '../../../styles/Resources.module.css';
import styles from '../../../styles/Essays.module.css';

const excerpts = [
  { label: 'Statement Of Purpose', text: 'I want to investigate how sequence variation alters protein structure and molecular function, and how these changes propagate to cellular behavior and responses to treatment.' },
  { label: 'Personal Statement', text: 'Through code, I could create a figure that was immune to restrictions. Regardless of the anxiety-inducing setbacks that creating successful code involved, computer science became my new track - one in which I could run forever.' },
];
export default function EssayBundle({ available, cancelled, gumroadUrl }: { available: boolean; cancelled: boolean; gumroadUrl: string | null }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [excerpt, setExcerpt] = useState(0);
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
  return <><Seo title="PhD Application Essays — Statement of Purpose & Personal Statement" description="Two PhD application essays by Pramesh Sharma, on research and the experiences behind it. Individual PDFs and a companion reading note. The collection is $5." path={ESSAY_PRODUCT.path} image="/images/social/phd-essay-bundle.png" breadcrumbs={[{name:'Home',path:'/'},{name:'Resources',path:'/resources'},{name:'PhD Application Essays',path:ESSAY_PRODUCT.path}]} schema={{ '@type': 'Product', name: ESSAY_PRODUCT.name, description: ESSAY_PRODUCT.description, image: `${SITE_URL}/images/social/phd-essay-bundle.png`, ...(available ? { offers: { '@type':'Offer', price:'5.00', priceCurrency:'USD', availability:'https://schema.org/InStock', url:`${SITE_URL}${ESSAY_PRODUCT.path}` } } : {}) }} />
    <main className={styles.page}>
      <nav className={resource.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/resources">Resources</Link><span>/ Application Essays</span></nav>
      <header className={styles.masthead}>
        <p>THE APPLICATION ESSAYS</p><p>PRAMESH SHARMA</p>
      </header>
      <section className={styles.hero} aria-labelledby="essay-title">
        <div className={styles.introduction}>
          <h1 id="essay-title">A life in research,<br /><em>in two essays.</em></h1>
          <p className={styles.dek}>A statement of purpose traces the questions a researcher wants to pursue. A personal statement reveals how those questions became personal.</p>
          <p className={styles.byline}>By <Link href="/experience">Pramesh Sharma</Link><span>Computational Biologist</span></p>
          <a href="#inside" className={styles.contentsLink}>Inside The Collection <span aria-hidden="true">↓</span></a>
        </div>
        <div className={styles.edition} aria-hidden="true">
          <div className={styles.paperBack}><span>II / PERSONAL STATEMENT</span><div className={styles.paperLines} /></div>
          <div className={styles.paperFront}><span>THE APPLICATION ESSAYS</span><div><p>Research.<br />Experience.<br /><em>Purpose.</em></p><div className={styles.paperRule} /></div><footer>Pramesh Sharma<span>TWO ESSAYS · PDF EDITION</span></footer></div>
        </div>
      </section>
      {cancelled && <p className={resource.status}>Checkout was cancelled. You can start again whenever you’re ready.</p>}
      <section id="inside" data-reveal className={styles.collection} aria-labelledby="collection-heading">
        <div>
          <p className={styles.kicker}>INSIDE THE COLLECTION</p><h2 id="collection-heading">My PhD Application Essays</h2>
          <p className={styles.collectionIntro}>Two complete essays, presented as written, with a companion note on reading them together.</p>
          <ol className={styles.contents}>
            <li><span className={styles.number}>01</span><div><h3>Statement Of Purpose</h3><p>A research trajectory, from early computational projects to questions about protein structure and disease.</p><span className={styles.fileMeta}>2 PAGES · PDF</span></div></li>
            <li><span className={styles.number}>02</span><div><h3>Personal Statement</h3><p>Chronic illness, the discovery of programming, and the experiences that gave research its personal significance.</p><span className={styles.fileMeta}>1 PAGE · PDF</span></div></li>
            <li><span className={styles.number}>03</span><div><h3>A Note To The Reader</h3><p>A short companion to the essays, with questions to consider as you develop your own application.</p><span className={styles.fileMeta}>PDF</span></div></li>
          </ol>
        </div>
        <aside className={styles.purchase} aria-label="Purchase The Essay Collection">
          <p className={styles.kicker}>THE COMPLETE COLLECTION</p><p className={styles.price}>$5<span>USD · One-Time Purchase</span></p>
          <p>Two essays and a reading note.<br />Three PDF files in one ZIP.</p>
          {gumroadUrl ? <a href={gumroadUrl} className={resource.primaryButton} rel="noopener noreferrer">Buy The Essay Bundle — $5</a> : available ? <button className={resource.primaryButton} onClick={buy} disabled={busy}>{busy ? 'Opening Secure Checkout…' : 'Buy The Essay Bundle — $5'}</button> : <p className={styles.unavailable}>Checkout is not open yet.</p>}
          {error && <p className={resource.error} role="alert">{error}</p>}
          <p className={styles.finePrint}>{gumroadUrl ? 'Checkout and file delivery through Gumroad. Your receipt includes a download link.' : available ? 'Secure payment through Stripe. Download after purchase, with a link sent to your receipt email.' : 'Explore the contents and selected passages below. Sales will open here when checkout is available.'}</p>
        </aside>
      </section>
      <section data-reveal className={styles.excerpts} aria-labelledby="excerpt-heading">
        <div className={styles.excerptHeader}><h2 id="excerpt-heading">From The Essays</h2><div className={styles.excerptButtons} role="group" aria-label="Choose An Excerpt">{excerpts.map((item, index) => <button key={item.label} type="button" aria-pressed={excerpt === index} onClick={() => setExcerpt(index)}>{item.label}</button>)}</div></div>
        <div className={styles.quoteFrame} aria-live="polite"><blockquote key={excerpt} className={styles.quote}><p>“{excerpts[excerpt].text}”</p><footer>— From the {excerpts[excerpt].label.toLowerCase()}</footer></blockquote></div>
      </section>
      <section data-reveal className={styles.readingNote} aria-labelledby="reading-heading">
        <p className={styles.kicker}>A NOTE ON READING</p>
        <div><h2 id="reading-heading">The work, and the life around it.</h2><p>Application essays ask us to give a coherent account of experiences that rarely felt coherent while we were living them. A project changes direction. An unexpected result becomes a new question. An experience outside the lab changes what feels worth studying.</p><p>These essays approach that history from different angles. Read together, they show how I connected the work I had done with the researcher I hoped to become.</p></div>
      </section>
      <footer className={styles.colophon}><p>For personal reading and reference. The essays reflect my experience at the time of writing. Redistribution and resale are not included.</p><p>For purchase or download questions, <Link href="/contact">contact me</Link>. For a free place to start, explore the <Link href="/resources/lab-search-tracker">lab-search tracker</Link>.</p></footer>
    </main>
  </>;
}
export const getServerSideProps: GetServerSideProps = async ({ query, res }) => {
  res.setHeader('Cache-Control','private, no-store');
  const gumroadUrl = gumroadProductUrl('phd-essays');
  return { props: { gumroadUrl, available: Boolean(gumroadUrl || commerceConfig()), cancelled: query.checkout === 'cancelled' } };
};

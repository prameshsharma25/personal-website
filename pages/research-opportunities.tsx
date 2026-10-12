import Head from 'next/head';
import { useEffect, useState } from 'react';
import dataset from '../data/research-opportunities.json';
import { countryLabel, listingStatus, Opportunity, researchAreas } from '../lib/research';
import styles from '../styles/Research.module.css';

const scanWarnings = (dataset as { scanWarnings?: { area: string; reason: string }[] }).scanWarnings || [];
const opportunities = dataset.opportunities as Opportunity[];
const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function ResearchOpportunities() {
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('All countries');
  const countries = [...new Set(opportunities.map(post => post.country))].sort((a, b) => countryLabel(a).localeCompare(countryLabel(b)));
  const [area, setArea] = useState('All areas');
  const [status, setStatus] = useState('Current listings');
  const [today, setToday] = useState(dataset.lastRun?.slice(0, 10) || '1970-01-01');
  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)); }, []);
  const visible = opportunities.filter(post => {
    const state = listingStatus(post, today);
    const matchesStatus = status === 'All listings' || (status === 'Current listings' ? !['Expired', 'Needs recheck'].includes(state) : state === status);
    return matchesStatus && (country === 'All countries' || post.country === country) && (area === 'All areas' || post.areas.includes(area)) &&
      `${post.professor} ${post.lab} ${post.university} ${post.location} ${countryLabel(post.country)} ${post.summary}`.toLowerCase().includes(query.toLowerCase().trim());
  }).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  return <>
    <Head>
        <link rel="canonical" href="https://prameshsharma.com/research-opportunities" />
      <title>PhD Opportunities | Pramesh Sharma</title>
      <meta name="description" content="Explore worldwide PhD opportunities in computational biology, bioinformatics, and machine learning, with recruiting sources and application details." />
    </Head>
    <main className={styles.main}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>WORLDWIDE · PHD RESEARCH</p>
        <h1>PhD Opportunities</h1>
        <p>Find your next research home in computational biology, bioinformatics, and machine learning.</p>
        <p className={styles.note}>Recruiting evidence and application details from university and lab websites. Confirm availability with the program before applying. A general invitation does not confirm an opening for a particular intake.</p>
        {dataset.lastRun && <p className={styles.note}>Last scan: {dateLabel(dataset.lastRun)} · Sources older than 45 days are flagged for rechecking.</p>}
        {scanWarnings.length > 0 && <p className={styles.note}>Latest scan incomplete for: {scanWarnings.map(warning => warning.area).join(', ')}. Existing listings remain available; check their source dates.</p>}
      </header>
      <div className={styles.filters}>
        <label>Search<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Professor, lab, school, or topic" /></label>
        <label>Country<select value={country} onChange={e => setCountry(e.target.value)}><option>All countries</option>{countries.map(code => <option key={code} value={code}>{countryLabel(code)}</option>)}</select></label>
        <label>Research area<select value={area} onChange={e => setArea(e.target.value)}>{['All areas', ...researchAreas].map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Recruiting status<select value={status} onChange={e => setStatus(e.target.value)}>{['Current listings', 'Advertised opening', 'General invitation', 'Needs recheck', 'Expired', 'All listings'].map(x => <option key={x}>{x}</option>)}</select></label>
      </div>
      <p role="status" className={styles.note}>{visible.length} {visible.length === 1 ? 'opportunity' : 'opportunities'}</p>
      {!visible.length && <div className={styles.empty}>
        <h2>{opportunities.length ? 'No matching opportunities' : 'Opportunities are on their way'}</h2>
        <p>{opportunities.length ? 'Try a different search or include expired listings.' : 'The first research scan is awaiting review. Published listings will include recruiting evidence and links to apply.'}</p>
      </div>}
      <div className={styles.list}>{visible.map(post => <article className={styles.card} key={post.id}>
        <div className={styles.tags}><span>{listingStatus(post, today)}</span>{post.areas.map(x => <span key={x}>{x}</span>)}</div>
        <h2>{post.lab}</h2>
        <p className={styles.professor}>{post.professor} · {post.university}</p>
        <p className={styles.note}>{post.location} · {countryLabel(post.country)}</p>
        <p>{post.summary}</p>
        <dl className={styles.details}>
          <div><dt>Entry term</dt><dd>{post.intake || 'Not stated'}</dd></div>
          <div><dt>Deadline</dt><dd>{post.deadline ? dateLabel(post.deadline) : 'Not stated'}{post.deadlineDetails && <><br />{post.deadlineDetails}</>}</dd></div>
          <div><dt>Funding</dt><dd>{post.funding || 'Not stated'}</dd></div>
          <div><dt>Eligibility</dt><dd>{post.eligibility || 'Not stated'}</dd></div>
          <div><dt>How to apply</dt><dd>{post.applicationDetails || 'See the official recruiting source for instructions.'}</dd></div>
        </dl>
        <details className={styles.evidence}><summary>Recruiting evidence · checked {dateLabel(post.lastChecked)}</summary><blockquote>{post.evidence}</blockquote><a href={post.sourceUrl} target="_blank" rel="noopener noreferrer">Read the recruiting source ↗</a></details>
        {post.applicationUrl && <a className={styles.apply} href={post.applicationUrl} target="_blank" rel="noopener noreferrer">Application information ↗</a>}
      </article>)}</div>
    </main>
  </>;
}

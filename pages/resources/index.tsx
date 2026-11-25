import Link from 'next/link';
import Seo from '../../components/Seo';
import NewsletterInvitation from '../../components/NewsletterInvitation';
import { STARTING_GUIDES } from '../../lib/site';
import styles from '../../styles/Resources.module.css';
export default function Resources() {
  return <><Seo title="Research Career Guides & Application Resources" description="Find research labs, write to professors, and organize applications with free guides and a lab-search tracker. Explore Pramesh Sharma’s PhD essay examples." path="/resources" breadcrumbs={[{name:'Home',path:'/'},{name:'Resources',path:'/resources'}]} />
    <main className={styles.page}><p className={styles.eyebrow}>TOOLS & FIRSTHAND GUIDES</p><h1 className={styles.title}>Make your next step<br />a little more concrete.</h1><p className={styles.lead}>Start with the question in front of you: which lab to contact, what to write, or how to explain the experiences that brought you here.</p>
      <div className={styles.grid}>
        <section className={styles.card}><p className={styles.eyebrow}>FREE / SPREADSHEET + GUIDE</p><h2>Lab-search tracker</h2><p>A lab shortlist, outreach log, follow-up dates, and a comparison worksheet in one workbook.</p><Link href="/resources/lab-search-tracker" className={styles.primaryButton}>Get the free tracker →</Link></section>
        <section className={styles.card}><p className={styles.eyebrow}>$5 / DIGITAL BUNDLE</p><h2>My PhD application essays</h2><p>My statement of purpose and personal statement in PDF and editable formats, with a short reading guide.</p><Link href="/resources/phd-essay-bundle" className={styles.secondaryButton}>Preview the bundle →</Link></section>
      </div>
      <section className={styles.body}><h2>Start with a guide</h2><div className={styles.grid}>{[...STARTING_GUIDES,{href:'/mentorship/phd-toolkit',label:'Prepare for PhD applications',description:'Research experience, mentoring relationships, and questions to ask as you prepare.'},{href:'/mentorship/early-career-programs',label:'Explore undergraduate opportunities',description:'A starting list of fellowships and programs to investigate.'},{href:'/mentorship/college-essay',label:'Read my college essay',description:'A personal essay and reflection on writing about lived experience.'}].map(g=><article className={styles.card} key={g.href}><h3><Link href={g.href}>{g.label}</Link></h3><p>{g.description}</p></article>)}</div></section>
      <NewsletterInvitation source="resources" />
    </main></>;
}

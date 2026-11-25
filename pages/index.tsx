import Link from 'next/link';
import Seo from '../components/Seo';
import ActionLink from '../components/ActionLink';
import NewsletterInvitation from '../components/NewsletterInvitation';
import { STARTING_GUIDES } from '../lib/site';
import styles from '../styles/Home.module.css';
import resource from '../styles/Resources.module.css';
export default function Home() {
  return <>
    <Seo title="Computational Biology & Finding Your Path into Research" description="Research-career guides, lab-search tools, and personal essays from Pramesh Sharma, a computational biologist with a computer science background." path="/" schema={{ '@type': 'Person', name: 'Pramesh Sharma', url: 'https://prameshsharma.com', jobTitle: 'Computational biologist', alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of California, Davis' }, sameAs: ['https://prameshsharma.substack.com', 'https://github.com/prameshsharma25'] }} />
    <main className={styles.home}>
      <section className={styles.hero}>
        <p className={resource.eyebrow}>PRAMESH SHARMA / COMPUTATIONAL BIOLOGIST & WRITER</p>
        <h1>Find your own<br />way into research.</h1>
        <p className={styles.description}>Practical guides for finding labs, reaching out to mentors, and connecting a computer science background to biology. Notes from a path that started at community college.</p>
        <div className={resource.actions}><ActionLink href="/resources/lab-search-tracker" event="tracker_invitation_click" source="home" className={resource.primaryButton}>Get the free lab-search tracker →</ActionLink><Link href="/resources" className={resource.secondaryButton}>Explore the guides</Link></div>
        <p className={resource.small}>Free resources, personal experiences, and tools you can put to work.</p>
      </section>
      <section className={styles.start} aria-labelledby="start-heading">
        <div className={styles.sectionHeader}><p className={resource.eyebrow}>A PLACE TO START</p><h2 id="start-heading">What are you working toward?</h2></div>
        <div className={styles.guideGrid}>{STARTING_GUIDES.map((g,i) => <Link href={g.href} key={g.href} className={styles.guideCard}><span className={styles.number}>0{i+1}</span><h3>{g.label}</h3><p>{g.description}</p><span className={styles.arrow} aria-hidden="true">↗</span></Link>)}</div>
      </section>
      <section className={styles.about}>
        <div><p className={resource.eyebrow}>THE PERSON BEHIND THE NOTES</p><h2>I’m Pramesh.</h2><p>I studied computer science at UC Davis and worked across software engineering and biological research. Today, I study how proteins change shape as a postbaccalaureate fellow at NIH.</p><p>Here, I share what I’ve learned from research, internships, living with a rare disease, and finding work that matters to me.</p><Link href="/experience" className={resource.textLink}>Read about my path →</Link></div>
        <div className={styles.note}><p className={resource.eyebrow}>FROM MY APPLICATION WRITING</p><h3>Two essays.<br />The story behind the research.</h3><p>My statement of purpose and personal statement, together in a $5 digital bundle.</p><Link href="/resources/phd-essay-bundle" className={resource.textLink}>See what’s included →</Link><p className={resource.small}>Personal examples for reference. No admissions outcome is claimed.</p></div>
      </section>
      <NewsletterInvitation source="home" /><p className={styles.personalNote}>This is my personal website. Views and resources are my own.</p>
    </main>
  </>;
}

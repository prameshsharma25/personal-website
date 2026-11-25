import Link from 'next/link';
import Seo from '../components/Seo';
import ProteinStudy from '../components/ProteinStudy';
import ActionLink from '../components/ActionLink';
import { STARTING_GUIDES } from '../lib/site';
import styles from '../styles/Home.module.css';
import resource from '../styles/Resources.module.css';

export default function Home() {
  return <>
    <Seo title="Computational Biologist" description="I study protein structure and fold switching at NIH. Here I share my research, experiences moving from software into biology, and advice on finding a lab." path="/" schema={{ '@type': 'Person', name: 'Pramesh Sharma', url: 'https://prameshsharma.com', jobTitle: 'Computational biologist', alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of California, Davis' }, sameAs: ['https://github.com/prameshsharma25'] }} />
    <main className={styles.home}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
        <p className={resource.eyebrow}>COMPUTATIONAL BIOLOGIST</p>
        <h1>Hi, I’m Pramesh.</h1>
        <p className={styles.description}>At NIH, I study proteins that can switch between different shapes. My work uses code and machine learning to understand these changes and the limits of protein structure prediction.</p>
        <p className={styles.description}>Getting here took a few changes of direction. I’ve shared what helped me find a lab, reach out to mentors, and move from software engineering into research.</p>
        <div className={resource.actions}>
          <ActionLink href="/resources/lab-search-tracker" event="tracker_invitation_click" source="home" className={resource.primaryButton}>Get the free lab-search tracker →</ActionLink>
          <Link href="/experience" className={resource.secondaryButton}>About my work</Link>
        </div>
        </div>
        <ProteinStudy />
      </section>
      <section data-reveal className={styles.start} aria-labelledby="start-heading">
        <div className={styles.sectionHeader}>
          <h2 id="start-heading">Looking for your first research lab?</h2>
          <p>Here’s what helped me get started, including the emails I actually sent.</p>
        </div>
        <div className={styles.guideGrid}>{STARTING_GUIDES.map((guide, i) =>
          <Link data-reveal data-reveal-delay={i * 70} href={guide.href} key={guide.href} className={styles.guideCard}>
            <span className={styles.number}>0{i + 1}</span>
            <h3>{guide.label}</h3><p>{guide.description}</p>
            <span className={styles.arrow} aria-hidden="true">↗</span>
          </Link>
        )}</div>
      </section>
      <section data-reveal className={styles.about} aria-label="Background and application essays">
        <div>
          <h2>Why biology?</h2>
          <p>I was born with Pyruvate Kinase Deficiency, and questions about my own health drew me toward biology. I studied computer science at UC Davis after starting at community college, then found my way into research through internships and software engineering.</p>
          <Link href="/posts/quitting-100k-software-job" className={resource.textLink}>Why I left software engineering →</Link>
        </div>
        <div className={styles.note}>
          <h2>My PhD application essays</h2>
          <p>Two essays about becoming a researcher: the questions I wanted to pursue and the experiences that brought me to them. Available together as a $5 PDF collection.</p>
          <Link href="/resources/phd-essay-bundle" className={resource.textLink}>Read an excerpt →</Link>
        </div>
      </section>

      <p className={styles.personalNote}>Views are my own.</p>
    </main>
  </>;
}

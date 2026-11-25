import Link from 'next/link';
import { useState } from 'react';
import Seo from '../../components/Seo';
import PageIntro from '../../components/PageIntro';
import ChoiceGroup from '../../components/ChoiceGroup';
import { STARTING_GUIDES } from '../../lib/site';
import ui from '../../styles/Interface.module.css';
import styles from '../../styles/Resources.module.css';

const guides = [
  ...STARTING_GUIDES.map((guide) => ({ ...guide, topic: 'Find A Lab' })),
  {
    href: '/mentorship/phd-toolkit',
    label: 'Prepare For PhD Applications',
    description:
      'Research experience, mentoring relationships, and questions to ask as you prepare.',
    topic: 'Write An Application',
  },
  {
    href: '/mentorship/early-career-programs',
    label: 'Explore Undergraduate Opportunities',
    description: 'A starting list of fellowships and programs to investigate.',
    topic: 'Find A Lab',
  },
  {
    href: '/mentorship/college-essay',
    label: 'Read My College Essay',
    description:
      'A personal essay and reflection on writing about lived experience.',
    topic: 'Write An Application',
  },
];
export default function Resources() {
  const [topic, setTopic] = useState('All Guides');
  const visible = guides.filter(
    (guide) => topic === 'All Guides' || guide.topic === topic
  );
  return (
    <>
      <Seo
        title="Research Career Guides & Application Resources"
        description="Find research labs, write to professors, and organize applications with free guides and a lab-search tracker. Explore Pramesh Sharma’s PhD essay examples."
        path="/resources"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Resources', path: '/resources' },
        ]}
      />
      <main className={ui.page}>
        <PageIntro
          eyebrow="Tools & Firsthand Guides"
          title="Make Your Next Step"
          accent="A Little More Concrete."
          description="Start with the question in front of you: which lab to contact, what to write, or how to explain the experiences that brought you here."
          aside={
            <>
              <p className={ui.miniLabel}>Your Research Search</p>
              <h2>One Step At A Time.</h2>
              <ol className={styles.startSteps}>
                <li>
                  <span>01</span>
                  <div>
                    <strong>Find A Connection</strong>
                    <p>Read the work. Notice what interests you.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Start A Conversation</strong>
                    <p>Write a specific, thoughtful introduction.</p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Keep Track</strong>
                    <p>Know who you’ve contacted and what’s next.</p>
                  </div>
                </li>
              </ol>
            </>
          }
        />
        <section className={ui.section} aria-labelledby="tools-heading">
          <div data-reveal className={ui.sectionHeading}>
            <h2 id="tools-heading">Tools You Can Use</h2>
            <p>A Practical Start, At Your Own Pace</p>
          </div>
          <div className={ui.grid}>
            <article
              data-tilt
              data-reveal
              className={`${ui.panel} ${styles.featuredTool}`}
            >
              <div className={ui.meta}>
                <span>01 / Free Download</span>
                <span>Excel + CSV + PDF</span>
              </div>
              <div className={styles.trackerPreview} aria-hidden="true">
                <span>Lab</span>
                <span>Connection</span>
                <span>Next Step</span>
                {Array.from({ length: 9 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
              <h3>Lab-Search Tracker</h3>
              <p>
                A lab shortlist, outreach log, follow-up dates, and a comparison
                worksheet in one workbook.
              </p>
              <Link
                href="/resources/lab-search-tracker"
                className={styles.primaryButton}
              >
                Get The Free Tracker <span aria-hidden="true">↗</span>
              </Link>
            </article>
            <article
              data-tilt
              data-reveal
              data-reveal-delay="80"
              className={`${ui.panel} ${styles.featuredTool}`}
            >
              <div className={ui.meta}>
                <span>02 / The Application Essays</span>
                <span>$5 · PDF Collection</span>
              </div>
              <div className={styles.essayPreview} aria-hidden="true">
                <span>Research.</span>
                <span>Experience.</span>
                <span>Purpose.</span>
              </div>
              <h3>My PhD Application Essays</h3>
              <p>
                Two essays on becoming a researcher: a statement of purpose and
                a personal statement, in PDF, with a reading note.
              </p>
              <Link
                href="/resources/phd-essay-bundle"
                className={styles.secondaryButton}
              >
                Preview The Bundle <span aria-hidden="true">↗</span>
              </Link>
            </article>
          </div>
        </section>
        <section className={ui.section} aria-labelledby="guides-heading">
          <div data-reveal className={ui.sectionHeading}>
            <h2 id="guides-heading">Start With A Guide</h2>
            <p>Choose What You’re Working On</p>
          </div>
          <ChoiceGroup
            label="Filter Guides By Goal"
            value={topic}
            onChange={setTopic}
            options={['All Guides', 'Find A Lab', 'Write An Application'].map(
              (value) => ({ value, label: value })
            )}
          />
          <p role="status" className={ui.results}>
            {visible.length} Guides
          </p>
          <div className={`${ui.grid} ${ui.listEntrance}`} key={topic}>
            {visible.map((guide, index) => (
              <Link
                data-tilt
                data-reveal
                data-reveal-delay={(index % 2) * 70}
                href={guide.href}
                key={guide.href}
                className={ui.panel}
              >
                <div className={ui.meta}>
                  <span>{guide.topic}</span>
                  <span aria-hidden="true">↗</span>
                </div>
                <h3>{guide.label}</h3>
                <p>{guide.description}</p>
                <span className={styles.guideAction}>
                  Read The Guide <span aria-hidden="true">→</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

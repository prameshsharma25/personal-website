import { useState } from 'react';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import LabTrackerInvitation from '../components/LabTrackerInvitation';
import Seo from '../components/Seo';
import { getAllGuides, type GuideMetadata } from '../lib/guides';
import styles from '../styles/Mentorship.module.css';
import resource from '../styles/Resources.module.css';

const paths = [
  {
    id: 'lab',
    number: '01',
    label: 'Find A Research Lab',
    audience: 'Students & Early Researchers',
    title: 'Turn Your Curiosity Into A Conversation',
    description:
      'You don’t need to have your whole career figured out to contact a lab. We can start with what interests you and work out who to reach out to.',
    topics: [
      'Build a shortlist of labs and research internships.',
      'Write a cold email with a clear reason for reaching out.',
      'Talk through NIH postbac, NSF REU, and NASA applications.',
    ],
    bring:
      'A lab you’re curious about, an email draft, or a question you haven’t known how to ask.',
    href: '/mentorship/cold-emailing',
    guide: 'Read The Cold-Email Guide',
  },
  {
    id: 'application',
    number: '02',
    label: 'Prepare An Application',
    audience: 'College, Postbac & PhD Applicants',
    title: 'Find The Thread In Your Experience',
    description:
      'An application is a chance to explain what you’ve done and what you want to understand next. We can work through a draft or start with the ideas behind it.',
    topics: [
      'Connect your research interests to specific programs.',
      'Review your CV, statement of purpose, or personal statement.',
      'Work through college essays, transfer applications, and UC application strategy.',
    ],
    bring:
      'A draft, a program description, and the part of the application you’re finding hardest.',
    href: '/mentorship/phd-toolkit',
    guide: 'Explore The PhD Application Guide',
  },
  {
    id: 'transition',
    number: '03',
    label: 'Move Into Research',
    audience: 'Software & Industry Professionals',
    title: 'Make Your Existing Skills Part Of The Story',
    description:
      'I moved from software engineering into computational biology. We can look at how your experience connects to research, and where you might want to build more depth.',
    topics: [
      'Translate software and industry projects into a research-focused CV.',
      'Identify skills to develop for computational biology roles.',
      'Plan conversations with researchers and potential mentors.',
    ],
    bring:
      'Your CV, a role or lab that interests you, and a sense of what you want to change.',
    href: '/posts/quitting-100k-software-job',
    guide: 'Read About My Move Into Research',
  },
] as const;

export default function Mentorship({ guides }: { guides: GuideMetadata[] }) {
  const [selected, setSelected] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const path = paths[selected];

  return (
    <>
      <Seo
        title="Research Career Mentorship & Free Application Guides"
        description="One-on-one mentorship with Pramesh Sharma on finding a research lab, preparing applications, reviewing your CV, and moving from software into science. Free guides included."
        path="/mentorship"
      />
      <main className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span aria-hidden="true" />
              One-On-One Mentorship
            </p>
            <h1 className={styles.title}>
              <span>Your Next Step.</span> <span>A Clearer Direction.</span>
            </h1>
            <p className={styles.intro}>
              I found my way from community college to software engineering,
              then into research. If you’re figuring out your own next step, we
              can work through it together.
            </p>
            <div className={resource.actions}>
              <a href="#paths" className={resource.primaryButton}>
                Find Your Starting Point <span aria-hidden="true">↗</span>
              </a>
              <a href="#book" className={resource.secondaryButton}>
                Book A Session
              </a>
            </div>
            <p className={styles.heroNote}>
              Research Careers · Applications · Career Changes
            </p>
          </div>
          <div className={styles.signal} aria-hidden="true">
            <div className={styles.signalGrid} />
            <div className={styles.signalHeader}>
              <span>A Little More Clarity</span>
              <span>↗</span>
            </div>
            <svg
              className={styles.signalRoute}
              viewBox="0 0 420 380"
              fill="none"
            >
              <path
                className={styles.routeBase}
                d="M77 72 C77 164 340 111 340 192 S108 220 108 315"
              />
              <path
                className={styles.routeLight}
                d="M77 72 C77 164 340 111 340 192 S108 220 108 315"
                pathLength="1"
              />
            </svg>
            <div className={`${styles.signalCard} ${styles.signalFirst}`}>
              <span>01</span>
              <div>
                <small>Start With A Question</small>
                <strong>Where Do I Begin?</strong>
              </div>
              <b>?</b>
            </div>
            <div className={`${styles.signalCard} ${styles.signalSecond}`}>
              <span>02</span>
              <div>
                <small>Talk It Through</small>
                <strong>Find The Connection</strong>
              </div>
              <b>↗</b>
            </div>
            <div className={`${styles.signalCard} ${styles.signalThird}`}>
              <span>03</span>
              <div>
                <small>Make A Plan</small>
                <strong>Choose Your Next Step</strong>
              </div>
              <b>→</b>
            </div>
            <div className={styles.signalFooter}>
              <span />A Conversation With Somewhere To Go
            </div>
          </div>
        </header>

        <section
          className={styles.pathSection}
          id="paths"
          aria-labelledby="paths-heading"
        >
          <div data-reveal className={styles.sectionHeading}>
            <p className={styles.eyebrow}>01 / Your Starting Point</p>
            <h2 id="paths-heading">What Are You Working Toward?</h2>
            <p>
              Choose the path that feels closest. It’s a place to start the
              conversation.
            </p>
          </div>
          <div
            className={styles.pathChoices}
            role="group"
            aria-label="Choose A Mentorship Path"
          >
            {paths.map((item, index) => (
              <button
                data-reveal
                data-reveal-delay={index * 80}
                data-tilt
                className={styles.pathChoice}
                key={item.id}
                type="button"
                aria-pressed={selected === index}
                aria-controls="mentorship-path-details"
                onClick={() => setSelected(index)}
              >
                <span className={styles.choiceTop}>
                  <span>{item.number}</span>
                  <span className={styles.choiceIndicator} aria-hidden="true">
                    {selected === index ? '↗' : '+'}
                  </span>
                </span>
                <strong>{item.label}</strong>
                <span className={styles.audience}>{item.audience}</span>
              </button>
            ))}
          </div>
          <p className={styles.srOnly} role="status">
            Showing {path.label}.
          </p>
          <div
            id="mentorship-path-details"
            className={styles.pathPanel}
            role="region"
            aria-labelledby="path-heading"
          >
            <div key={path.id} className={styles.panelEntrance}>
              <div className={styles.pathIntro}>
                <p className={styles.eyebrow}>
                  Path {path.number} / {path.label}
                </p>
                <h3 id="path-heading">{path.title}</h3>
                <p>{path.description}</p>
                <Link href={path.href} className={styles.guideLink}>
                  {path.guide} <span aria-hidden="true">↗</span>
                </Link>
              </div>
              <div className={styles.pathPlan}>
                <h4>What We Can Work On</h4>
                <ul>
                  {path.topics.map((topic, index) => (
                    <li key={topic}>
                      <span aria-hidden="true">0{index + 1}</span>
                      {topic}
                    </li>
                  ))}
                </ul>
                <div className={styles.bring}>
                  <h4>Bring Along</h4>
                  <p>{path.bring}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="book"
          className={styles.booking}
          aria-labelledby="booking-heading"
        >
          <div data-reveal className={styles.bookingCopy}>
            <p className={styles.eyebrow}>02 / Work Through It Together</p>
            <h2 id="booking-heading">
              Bring The Question.
              <br />
              We’ll Start There.
            </h2>
            <p>
              I’ve been the student writing a first cold email and the engineer
              wondering how to move into science. You don’t need a polished plan
              before we talk.
            </p>
            <ol className={styles.sessionSteps}>
              <li>
                <span>01</span>
                <div>
                  <h3>Share Where You Are</h3>
                  <p>
                    Your background, what you’re considering, and what feels
                    uncertain.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Work Through One Priority</h3>
                  <p>
                    A draft, a decision, or the next conversation you want to
                    have.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Identify A Next Step</h3>
                  <p>
                    Something specific you can work on after the conversation.
                  </p>
                </div>
              </li>
            </ol>
          </div>
          <div
            data-reveal
            data-reveal-delay="100"
            className={styles.bookingCard}
          >
            <p className={styles.eyebrow}>A Conversation With Pramesh</p>
            <h3>Book A Session</h3>
            <p>Choose an available time that works for you.</p>
            <div className={styles.selectedFocus}>
              <span>Your Starting Point</span>
              <strong>{path.label}</strong>
              <a href="#paths">
                Change Your Focus <span aria-hidden="true">↗</span>
              </a>
            </div>
            <button
              className={resource.primaryButton}
              type="button"
              aria-expanded={calendarOpen}
              aria-controls="mentorship-calendar"
              onClick={() => setCalendarOpen(!calendarOpen)}
            >
              {calendarOpen ? 'Hide Calendar' : 'Show Available Times'}{' '}
              <span aria-hidden="true">{calendarOpen ? '−' : '+'}</span>
            </button>
            <a
              className={styles.externalBooking}
              href="https://calendly.com/prameshsharma25"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Calendly In A New Tab <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div
            id="mentorship-calendar"
            className={styles.calendar}
            hidden={!calendarOpen}
          >
            {calendarOpen && (
              <iframe
                src="https://calendly.com/prameshsharma25"
                title="Calendly Scheduling"
                loading="lazy"
                width="100%"
                height="720"
              />
            )}
          </div>
        </section>

        <section
          className={styles.guidesSection}
          id="guides"
          aria-labelledby="guides-heading"
        >
          <div data-reveal className={styles.sectionHeading}>
            <p className={styles.eyebrow}>03 / Read At Your Own Pace</p>
            <h2 id="guides-heading">Start With A Guide</h2>
            <p>
              Examples, reflections, and tools from my own path into research.
            </p>
          </div>
          <div className={styles.guideGrid}>
            {guides.length ? (
              guides.map((guide, index) => (
                <Link
                  data-reveal
                  data-reveal-delay={(index % 2) * 80}
                  data-tilt
                  href={`/mentorship/${guide.slug}`}
                  key={guide.slug}
                  className={styles.guideCard}
                >
                  <div className={styles.guideMeta}>
                    <span>Free Guide</span>
                    <span aria-hidden="true">↗</span>
                  </div>
                  <h3>{guide.title}</h3>
                  <p>{guide.description}</p>
                  <span className={styles.readGuide}>
                    Read The Guide <span aria-hidden="true">→</span>
                  </span>
                </Link>
              ))
            ) : (
              <p className={styles.noGuides}>More guides are on the way.</p>
            )}
          </div>
          <div data-reveal>
            <LabTrackerInvitation source="mentorship" />
          </div>
        </section>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { guides: getAllGuides() },
  revalidate: 3600,
});

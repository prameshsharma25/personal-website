import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps } from 'next';
import styles from '../styles/Mentorship.module.css';
import { getAllGuides, GuideMetadata } from '../lib/guides';

interface MentorshipPageProps {
  guides: GuideMetadata[];
}

export default function Mentorship({ guides }: MentorshipPageProps) {
  return (
    <div>
      <Head>
        <title>Mentorship - Pramesh Sharma</title>
        <meta name="description" content="Resume reviews and career guidance for students navigating research, internships, and PhD applications." />
      </Head>
      <main className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Mentorship</h1>
          <p className={styles.subtitle}>
            I offer resume reviews and career guidance to help you navigate your journey in tech and science.
          </p>
        </div>

        {/* Who This Is For */}
        <section className={styles.section}>
          <div className={styles.sectionContent}>
            <h2 className={styles.sectionTitle}>Who This Is For</h2>
            <div className={styles.audienceGrid}>
              <div className={styles.audienceCard}>
                <h3 className={styles.audienceCardTitle}>Undergrads & Community College Students</h3>
                <p className={styles.audienceCardText}>
                  Navigating research internships, transfer applications, or figuring out how to break into STEM without a traditional path.
                </p>
              </div>
              <div className={styles.audienceCard}>
                <h3 className={styles.audienceCardTitle}>Aspiring Researchers</h3>
                <p className={styles.audienceCardText}>
                  Applying to postbac programs, PhD programs, or trying to cold email a PI for the first time and not sure where to start.
                </p>
              </div>
              <div className={styles.audienceCard}>
                <h3 className={styles.audienceCardTitle}>Career Pivoters</h3>
                <p className={styles.audienceCardText}>
                  Engineers or CS grads who want to move into biotech, computational biology, or research — and aren&apos;t sure how to reframe their background.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* What We Can Cover */}
        <section className={styles.section}>
          <div className={styles.sectionContent}>
            <h2 className={styles.sectionTitle}>What We Can Cover</h2>
            <ul className={styles.topicsList}>
              <li className={styles.topicItem}>Resume and CV review for research or industry roles</li>
              <li className={styles.topicItem}>Cold emailing professors, PIs, and industry contacts</li>
              <li className={styles.topicItem}>Applying to NIH postbac, NSF REU, and NASA internship programs</li>
              <li className={styles.topicItem}>PhD program applications and personal statement strategy</li>
              <li className={styles.topicItem}>Transitioning from software engineering into computational biology</li>
              <li className={styles.topicItem}>College essays and UC application strategy</li>
            </ul>
          </div>
        </section>

        {/* Calendly Section */}
        <section className={styles.section}>
          <div className={styles.sectionContent}>
            <h2 className={styles.sectionTitle}>Book a Session</h2>
            <p className={styles.sectionDescription}>
              I&apos;ve navigated community college, two NASA internships, two Genentech internships, a Walmart SWE role,
              and the NIH — all without a traditional path. I know what it takes to cold email a PI, reframe an engineering
              background for research, and write the kind of application that gets read. Schedule 30 minutes and let&apos;s
              work on whatever&apos;s in front of you.
            </p>
            <div className={styles.calendlyContainer}>
              <iframe
                src="https://calendly.com/prameshsharma25"
                width="100%"
                height="700"
                frameBorder="0"
                title="Calendly Scheduling"
              ></iframe>
            </div>
          </div>
        </section>

        {/* Resources Section */}
        <section className={styles.section} id="guides">
          <div className={styles.sectionContent}>
            <h2 className={styles.sectionTitle}>Resources & Guides</h2>
            <p className={styles.sectionDescription}>
              A collection of guides and resources to help you in your career journey.
            </p>
            <div className={styles.resourcesList}>
              {guides.length > 0 ? (
                guides.map((guide) => (
                  <Link
                    key={guide.slug}
                    href={`/mentorship/${guide.slug}`}
                    className={styles.resourceItem}
                  >
                    <div className={styles.resourceHeader}>
                      <h3 className={styles.resourceTitle}>{guide.title}</h3>
                      <span className={styles.resourceTag}>Guide</span>
                    </div>
                    <p className={styles.resourceDescription}>
                      {guide.description}
                    </p>
                  </Link>
                ))
              ) : (
                <p className={styles.noGuides}>More guides coming soon...</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps<MentorshipPageProps> = async () => {
  const guides = getAllGuides();
  return {
    props: {
      guides,
    },
    revalidate: 3600,
  };
};
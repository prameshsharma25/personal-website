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
        <meta name="description" content="Book a session for resume reviews and career guidance" />
      </Head>

      <main className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Mentorship</h1>
          <p className={styles.subtitle}>
            I offer resume reviews and career guidance to help you navigate your journey in tech and science.
          </p>
        </div>

        {/* Calendly Section */}
        <section className={styles.section}>
          <div className={styles.sectionContent}>
            <h2 className={styles.sectionTitle}>Book a Session</h2>
            <p className={styles.sectionDescription}>
              Schedule a 30-minute session with me. We can discuss your resume, career goals, or anything else on your mind.
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
    revalidate: 3600, // Revalidate every hour
  };
};

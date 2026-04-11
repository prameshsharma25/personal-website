import Head from 'next/head';
import styles from '../styles/Mentorship.module.css';

export default function Mentorship() {
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
        <section className={styles.section}>
          <div className={styles.sectionContent}>
            <h2 className={styles.sectionTitle}>Resources & Guides</h2>
            <p className={styles.sectionDescription}>
              A collection of guides and resources to help you in your career journey.
            </p>
            <div className={styles.resourcesList}>
              <div className={styles.resourceItem}>
                <div className={styles.resourceHeader}>
                  <h3 className={styles.resourceTitle}>Coming Soon</h3>
                  <span className={styles.resourceTag}>In Development</span>
                </div>
                <p className={styles.resourceDescription}>
                  I&apos;m working on guides including &quot;How to Cold Email&quot; and other resources to help you excel in your career.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

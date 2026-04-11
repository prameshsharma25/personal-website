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
              <a
                href="https://www.notion.so/My-Cold-Emailing-Template-Academia-Industry-4bc7b4d79a1f48138f2d5d2103ea00b5"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.resourceItem}
              >
                <div className={styles.resourceHeader}>
                  <h3 className={styles.resourceTitle}>Cold Emailing Template</h3>
                  <span className={styles.resourceTag}>Guide</span>
                </div>
                <p className={styles.resourceDescription}>
                  My templates and strategies for cold emailing in academia and industry. Learn how to craft compelling emails that get responses.
                </p>
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

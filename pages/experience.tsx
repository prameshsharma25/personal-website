import Head from 'next/head';
import styles from '../styles/Experience.module.css';

export default function Experience() {
  const experiences = [
    {
      title: 'Software Engineer',
      company: 'Intelligent Retail Lab by Walmart',
      date: 'July 2024 - Present',
      description: 'Store Vision Services',
    },
    {
      title: 'Computational Biology Intern',
      company: 'NASA',
      date: 'August 2023 - December 2023',
      description: 'Space Biosciences Research',
    },
    {
      title: 'Software Engineering Intern',
      company: 'Intelligent Retail Lab by Walmart',
      date: 'June 2023 - August 2023',
      description: 'Intelligent Store Technology',
    },
    {
      title: 'Space Systems Engineering Intern',
      company: 'NASA',
      date: 'August 2022 - December 2022',
      description: 'Systems Engineering Branch',
    },
    {
      title: 'Computational Proteomics Intern',
      company: 'Genentech',
      date: 'June 2022 - September 2022',
      description: 'Microchemistry Proteomics and Lipidomics',
    },
    {
      title: 'Pharma Technical Operations Intern',
      company: 'Genentech',
      date: 'January 2022 - June 2022',
      description: 'Manufacturing Science and Technology',
    },
  ];

  return (
    <div>
      <Head>
        <title>Work Experience</title>
        <meta
          name="description"
          content="Learn more about me and my journey."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        {/* Work Experience Section */}
        <section className={styles.hero}>
          <div>
            <p className={styles.heroDescription}>
              Take a look at my work experience below! My interests stretch from biotech to aerospace. I have a particular emphasis in Machine Learning Infrastructure and Scientific Computing.
            </p>
          </div>
        </section>
        {/* Experience Section */}
        <section className={styles.timelineSection}>
          <h2 className={styles.timelineHeader}>Work Experience</h2>
          <div className={styles.timelineList}>
            {experiences.map((experience, index) => (
              <div
                key={index}
                className={styles.timelineContainer}
                style={{ animationDelay: `${index * 0.15}s` }}
              >
                <div className={styles.timelineMarker}>
                  <div className={styles.timelineMarkerInner}></div>
                </div>
                <div className={styles.timelineContent}>
                  <h3 className={styles.timelineTitle}>
                    {experience.title}
                  </h3>
                  <p className={styles.timelineCompany}>{experience.company}</p>
                  <p className={styles.timelineDate}>{experience.date}</p>
                  <p className={styles.timelineDescription}>
                    {experience.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
        {/* Resume Section */}
        <section className={styles.resumeSection}>
          <div className="container mx-auto text-center">
            <h2 className={styles.resumeTitle}>Resume</h2>
            <p className={styles.resumeDescription}>
              You can view my resume below or download it using the button:
            </p>
            <a
              href="/resume.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.resumeButton}
            >
              Download Resume
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

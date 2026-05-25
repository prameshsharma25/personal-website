import Head from 'next/head';
import styles from '../styles/Experience.module.css';

export default function Experience() {
  const experiences = [
    {
      title: 'Postbaccalaureate Fellow',
      company: 'National Institutes of Health',
      date: 'August 2025 - Present',
      description: 'Computational Biology Branch',
      bullets: [
        'Developed an AI interpretability tool leveraging AlphaFold attention weights to extract biologically meaningful insights from protein structures, earning 10+ GitHub stars and a bioRxiv manuscript',
        'Engineered an end-to-end inference pipeline integrating distance-based clustering and backbone geometry to identify fold-switching proteins',
        'Streamlined automated testing and multi-environment package releases with GitHub Actions, reducing deployment time by 3 minutes per pull request',
        'Instituted an elevated standard for code quality increasing test coverage to 90% using pytest on a codebase spanning 50+ integration and unit tests',
      ],
    },
    {
      title: 'Software Engineer',
      company: 'Intelligent Retail Lab by Walmart',
      date: 'July 2024 - July 2025',
      description: 'Store Vision Services',
      bullets: [
        'Optimized collection of hardware metrics across a cluster of NVIDIA Jetson GPUs by replacing jetson-stats through development of a real-time system monitoring tool using Python, Prometheus, and Grafana',
        'Automated ML training workflows by developing a model converter that transforms PyTorch ONNX models into DeepStream-compatible TensorRT engines using Kubeflow and WandB',
        'Improved image transformation processing for 40,000+ grocery item images by building a scalable data augmentation pipeline in Python using Apache Beam and Dataflow, deployed as a Google Flex Template',
        'Reduced object detection inference latency across edge cameras by deploying a scalable DeepStream pipeline to run multiple YOLO models via gRPC streaming of inference outputs to Google BigQuery',
      ],
    },
    {
      title: 'Computational Biology Intern',
      company: 'NASA',
      date: 'August 2023 - December 2023',
      description: 'Space Biosciences Research',
      bullets: [
        'Conducted radiobiology literature review to inform integration of the Linear Quadratic model into AMMPER, aligning radiation dose-response with experimental data',
        'Redefined cell health model using Python to simulate and enhance cell behavior predictions, establishing probability distributions for apoptosis, DNA damage, and mitotic catastrophe',
        'Enhanced model accuracy by 40% by designing an AlamarBlue viability model using Michaelis-Menten kinetics, leveraging AutoML and SMAC3 with Grid and Bayesian hyperparameter search',
      ],
    },
    {
      title: 'Space Systems Engineering Intern',
      company: 'NASA',
      date: 'August 2022 - December 2022',
      description: 'Systems Engineering Branch',
      bullets: [
        'Streamlined cross-functional collaboration by standardizing project modeling for the $14.8B Lunar Pilot Excavator through a Systems Engineering Modeling Management Plan in MagicDraw',
        'Replaced paper-based workflows across 3+ engineering divisions through a strategy aligning digital engineering review processes',
        'Communicated project modeling strategy to key stakeholders by presenting the SEMMP template and Concept of Operations to design and chief engineering teams',
      ],
    },
    {
      title: 'Computational Proteomics Intern',
      company: 'Genentech',
      date: 'June 2022 - September 2022',
      description: 'Microchemistry Proteomics and Lipidomics',
      bullets: [
        'Increased efficiency of antibody analysis for wet lab scientists by developing an internal tool using the Pyramid REST framework that converts protein-peptide data into heat maps',
        'Streamlined data processing for large datasets by creating a CLI using the optparse R package that handles up to 3,000 samples of protein-peptide information at once',
        'Deployed tool into production by containerizing the dataMAPPs R package with Docker and Python',
      ],
    },
    {
      title: 'Pharma Technical Operations Intern',
      company: 'Genentech',
      date: 'January 2022 - June 2022',
      description: 'Manufacturing Science and Technology',
      bullets: [
        'Increased efficiency of drug campaign creation by optimizing manufacturing on-call service using JavaScript and PagerDuty API',
        'Automated user access to drug campaign incidents with JavaScript and Google Sheets API, resulting in cost savings of 5 minutes per incident',
        'Standardized Genentech\'s PagerDuty response procedures by documenting a comprehensive 10-page Rapid Response Playbook ensuring SOP compliance',
      ],
    },
  ];

  const publications = [
    {
      title: 'EasyDIVER+: an advanced tool for analyzing high throughput sequencing data from in vitro evolution of nucleic acids or amino acids',
      journal: 'Journal of Molecular Evolution',
      authors: 'Celia Blanco, Allison Tee, Pramesh Sharma, Matilda S. Newton, Kun-Hwa Lee, Samuel E. Erickson, Burckhard Seelig, Irene A. Chen',
      link: null,
    },
    {
      title: 'AMMPER-2: A spatially explicit agent-based model of microbial radiobiology with redox dye simulation',
      journal: 'American Society for Microbiology',
      authors: 'Jessica A. Lee, Daniel Palacios, Amrita Singh, Madeline Marous, Pramesh Sharma, Lauren Liddel, Diana Gentry, Sergio Santa Maria',
      link: null,
    },
  ];

  return (
    <div>
      <Head>
        <title>About - Pramesh Sharma</title>
        <meta
          name="description"
          content="Postbaccalaureate Fellow at the NIH studying fold-switching proteins. Formerly at NASA, Genentech, and Walmart. UC Davis CS graduate."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
        {/* Bio Section */}
        <section className={styles.bioSection}>
        <h1 className={styles.bioName}>Who am I?</h1>
        <p className={styles.bioRole}>Postbaccalaureate Fellow, NIH · Computational Structural Biology</p>
        <p className={styles.bioText}>
          I started my career building computer vision systems for Walmart and chasing a NASA internship I&apos;d been rejected from twice.
          What pulled me back to biology wasn&apos;t a plan — it was a rare genetic disease I was born with, and the realization that the
          problems I actually cared about lived at the intersection of computation and human health. That thread has run through
          everything since: two internships at Genentech, two at NASA, and now the NIH, where I develop AI-driven tools to study
          proteins that switch shapes to carry out different biological functions.
        </p>
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
                  <h3 className={styles.timelineTitle}>{experience.title}</h3>
                  <p className={styles.timelineCompany}>{experience.company}</p>
                  <p className={styles.timelineDate}>{experience.date}</p>
                  <p className={styles.timelineDescription}>{experience.description}</p>
                  {experience.bullets.length > 0 && (
                    <ul className={styles.timelineBullets}>
                      {experience.bullets.map((bullet, i) => (
                        <li key={i} className={styles.timelineBullet}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Publications Section */}
        <section className={styles.publicationsSection}>
          <h2 className={styles.timelineHeader}>Publications</h2>
          <div className={styles.publicationsList}>
            {publications.map((pub, index) => (
              <div key={index} className={styles.publicationItem}>
                <p className={styles.publicationTitle}>
                  {pub.link ? (
                    <a href={pub.link} target="_blank" rel="noopener noreferrer">{pub.title}</a>
                  ) : (
                    pub.title
                  )}
                </p>
                <p className={styles.publicationJournal}>{pub.journal}</p>
                <p className={styles.publicationAuthors}>{pub.authors}</p>
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
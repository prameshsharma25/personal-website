import Head from 'next/head';
import styles from '../styles/Home.module.css';

const SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Pramesh Sharma",
  "url": "https://prameshsharma.com",
  "image": "https://prameshsharma.com/profile.jpg",
  "jobTitle": "Postbaccalaureate Fellow",
  "worksFor": {
    "@type": "Organization",
    "name": "National Institutes of Health",
    "url": "https://www.nih.gov"
  },
  "alumniOf": {
    "@type": "CollegeOrUniversity",
    "name": "University of California, Davis"
  },
  "description": "I'm a Computational Biologist and NIH Postbaccalaureate Fellow developing machine learning methods to predict protein conformational states. I graduated from UC Davis with a degree in Computer Science. I use my background in both biology and computer science to bridge the gap between these fields and communicate complex scientific concepts to diverse audiences. I am passionate about science and mentoring future scientists and engineers.",
  "knowsAbout": [
    "Computational Biology",
    "Machine Learning",
    "Protein Structure Prediction",
    "AlphaFold",
    "Bioinformatics",
    "Scientific Computing",
    "Python",
    "SLURM / HPC"
  ],
  "sameAs": [
    "https://prameshsharma.substack.com",
    "https://github.com/prameshsharma25"
  ]
};

export default function Home() {
  return (
    <div>
      <Head>
        {/* ── Core SEO ── */}
        <title>Pramesh Sharma | Computational Biologist & NIH Postbac Fellow</title>
        <meta
          name="description"
          content="I'm a Computational Biologist and NIH Postbaccalaureate Fellow developing machine learning methods to predict protein conformational states. I graduated from UC Davis with a degree in Computer Science. I use my background in both biology and computer science to bridge the gap between these fields and communicate complex scientific concepts to diverse audiences. I am passionate about science and mentoring future scientists and engineers."
        />
        <meta
          name="keywords"
          content="Pramesh Sharma, computational biology, NIH postbac, fold-switching proteins, AlphaFold, bioinformatics, machine learning, protein structure, science communication, STEM mentor"
        />
        <link rel="canonical" href="https://prameshsharma.com/" />

        {/* ── Open Graph ── */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prameshsharma.com/" />
        <meta property="og:title" content="Pramesh Sharma | Computational Biologist & NIH Postbac Fellow" />
        <meta
          property="og:description"
          content="NIH Postbaccalaureate Fellow building ML pipelines for protein structure prediction. UC Davis CS graduate, science communicator, and STEM mentor."
        />
        <meta property="og:image" content="https://prameshsharma.com/og-image.png" />

        {/* ── Twitter Card ── */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Pramesh Sharma | Computational Biologist & NIH Postbac Fellow" />
        <meta
          name="twitter:description"
          content="NIH Postbaccalaureate Fellow building ML pipelines for protein structure prediction. UC Davis CS grad, science communicator, STEM mentor."
        />
        <meta name="twitter:image" content="https://prameshsharma.com/og-image.png" />

        {/* ── Schema.org JSON-LD ── */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }}
        />

        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <main className={styles.heroContainer}>
        <div className={styles.heroCard}>
          <div className={styles.status}>ONLINE</div>

          <h1 className={styles.heroName}>Pramesh Sharma</h1>

          {/*
            This paragraph is the most important text Google indexes on this page.
            It's keyword-rich but reads naturally — covers your role, institution,
            research focus, and secondary identity as a science communicator.
          */}
          <p className={styles.heroDescription}>
            I&apos;m a Computational Biologist and NIH Postbaccalaureate Fellow developing machine learning methods to predict protein conformational states. I graduated from UC Davis with a degree in Computer Science. I use my background in both biology and computer science to bridge the gap between these fields and communicate complex scientific concepts to diverse audiences. I am passionate about science and mentoring future scientists and engineers.
          </p>

          {/* Terminal card — unchanged from your original */}
          <div className={styles.terminalWindow}>
            <div className={styles.terminalHeader}>
              <div className={styles.terminalDot}></div>
              <div className={styles.terminalDot}></div>
              <div className={styles.terminalDot}></div>
              <div className={styles.terminalTitle}>system.log</div>
            </div>
            <div className={styles.terminalBody}>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>~$</span>
                <span className={styles.output}>cat profile.txt</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.outputDim}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.output}>Name: Pramesh Sharma</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.output}>Role: Postbaccalaureate Fellow</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.output}>Organization:&nbsp; National Institutes of Health</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.output}>Lab:&nbsp; National Library of Medicine · Porter Lab</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.outputDim}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>~$</span>
                <span className={styles.output}>skills --list</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.outputDim}>→ Machine Learning</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.outputDim}>→ Scientific Computing</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.outputDim}>→ Software Engineering</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.outputDim}>→ Science Communication</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>~$</span>
                <span className={styles.output}>links --featured</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.outputDim}>
                  → <a href="https://prameshsharma.substack.com" target="_blank" rel="noopener noreferrer" style={{color:'inherit'}}>Substack</a>
                </span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.outputDim}>
                  → <a href="https://medium.com/@prameshsharma25" style={{color:'inherit'}}>Medium</a>
                </span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>&nbsp;&nbsp;</span>
                <span className={styles.outputDim}>
                  → <a href="https://www.pinterest.com/prameshsharma25/" style={{color:'inherit'}}>Pinterest</a>
                </span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>~$</span>
                <span className={styles.cursor}></span>
              </div>
            </div>
          </div>

          {/*
            Visually hidden but crawlable text — gives Google more signal
            without cluttering the visual design. Remove if it conflicts
            with your CSS (confirm .srOnly is defined or add it below).
          */}
          <p className={styles.srOnly}>
            Pramesh Sharma is a Computational Biologist specializing in protein structure
            prediction and bioinformatics. His NIH research applies AlphaFold2 attention
            analysis and k-medoids clustering to identify distinct conformational states in
            fold-switching proteins. He has previously interned at NASA Ames (computational
            biology), Genentech (computational proteomics), and Walmart (computer vision /
            deep learning). He writes about science, career transitions, and STEM mentorship
            on Substack.
          </p>
        </div>
      </main>
    </div>
  );
}
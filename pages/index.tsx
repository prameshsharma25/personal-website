import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  return (
    <div>
      <Head>
        <title>Pramesh Sharma</title>
        <meta name="description" content="Welcome to my personal website!" />
      </Head>

      <main className={styles.heroContainer}>
        <div className={styles.heroCard}>
          <div className={styles.status}>ONLINE</div>
          
          <h1 className={styles.heroName}>
            Pramesh Sharma
          </h1>
          
          <p className={styles.heroDescription}>
            I received my Bachelor's in Computer Science from the University of California, Davis. Currently, I work at the National Institutes of Health studying fold-switching proteins.
          </p>

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
                <span className={styles.output}>Company: National Institutes of Health</span>
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
                <span className={styles.outputDim}>→ Computational Biology</span>
              </div>
              <div className={styles.terminalLine}>
                <span className={styles.prompt}>~$</span>
                <span className={styles.cursor}></span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
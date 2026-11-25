import Link from 'next/link';
import Seo from '../../components/Seo';
import PageIntro from '../../components/PageIntro';
import ui from '../../styles/Interface.module.css';
import styles from '../../styles/Tools.module.css';

export default function Tools() {
  return (
    <>
      <Seo
        title="Structural Biology Tools"
        description="Explore structural biology tools from Pramesh Sharma. Analyze amyloid structures, compare and cluster conformations, and review ranked candidates in your browser."
        path="/tools"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Tools', path: '/tools' },
        ]}
      />
      <main className={ui.page}>
        <PageIntro
          eyebrow="Tools / Structural Biology"
          title="A Closer Look At"
          accent="Your Structures."
          description="Tools from my ongoing research, built to make structural predictions easier to inspect and question."
        />
        <article data-reveal className={styles.toolCard}>
          <div className={styles.toolVisual} aria-hidden="true">
            <div className={styles.scan} />
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                className={styles.strand}
                style={{
                  transform: `translateY(${i * 24}px) rotate(-18deg)`,
                  opacity: 1 - i * 0.07,
                }}
              >
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            ))}
            <span>Analyze → Compare → Cluster → Rank</span>
          </div>
          <div className={styles.toolCopy}>
            <p className={styles.kicker}>01 / Free Research Tool</p>
            <h2>Amyloid Structure Analysis</h2>
            <p>
              Bring your predicted assemblies together in one analysis pipeline.
              Calculate structural descriptors, compare conformations, and
              explore clusters and ranked candidates on your own device.
            </p>
            <ul>
              <li>Geometry, packing, energetics, and warning reports</li>
              <li>MM-align comparisons and HDBSCAN clustering</li>
              <li>
                Interactive structures, cluster representatives, and candidate
                ranking
              </li>
            </ul>
            <Link href="/tools/amyloid-inspector" className={styles.primary}>
              Open Analysis <span aria-hidden="true">↗</span>
            </Link>
            <p className={styles.caption}>
              Post-Prediction Analysis & Downloadable Reports
            </p>
          </div>
        </article>
        <p className={styles.footerNote}>
          Developed alongside my{' '}
          <Link href="/experience#projects">ongoing research</Link>. Scientific
          calculations come from the Amyloid Candidates package; this interface
          helps you examine the results.
        </p>
      </main>
    </>
  );
}

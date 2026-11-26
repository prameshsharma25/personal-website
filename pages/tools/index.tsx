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
        description="Explore structural biology tools from Pramesh Sharma. Analyze amyloid structures and connect protein regions to UniProt and InterPro annotations in your browser."
        path="/tools"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Tools', path: '/tools' },
        ]}
      />
      <main className={`${ui.page} ${styles.toolsPage}`}>
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
        <article data-reveal className={styles.toolCard}>
          <div className={styles.toolVisual} aria-hidden="true">
            <div className={styles.scan} />
            <svg viewBox="0 0 500 360" width="100%" height="360" fill="none">
              <path d="M70 220C40 100 190 65 210 170S340 300 360 170S465 60 435 235" stroke="#3e668b" strokeWidth="28" strokeLinecap="round" />
              <path d="M70 220C40 100 190 65 210 170S340 300 360 170S465 60 435 235" stroke="#93c7ef" strokeWidth="13" strokeLinecap="round" />
              <path d="M210 170C230 275 330 280 350 210" stroke="#ffc473" strokeWidth="18" strokeLinecap="round" />
              <rect x="184" y="158" width="187" height="133" rx="20" stroke="#60dfd3" strokeWidth="2" strokeDasharray="6 7" />
              <circle cx="277" cy="253" r="10" fill="#ffc473" />
            </svg>
            <span>Select → Map → Annotate → Explore</span>
          </div>
          <div className={styles.toolCopy}>
            <p className={styles.kicker}>02 / Free Research Tool</p>
            <h2>Protein Annotation Explorer</h2>
            <p>Highlight a region in your protein and explore its reference annotations. Keep the sequence, structure, and supporting evidence together.</p>
            <ul><li>Linked residue selection in sequence and 3D</li><li>UniProt features and InterPro domains</li><li>Reference mapping, research notes, and downloadable reviews</li></ul>
            <Link href="/tools/protein-annotations" className={styles.primary}>Open Annotation Explorer <span aria-hidden="true">↗</span></Link>
            <p className={styles.caption}>Your Protein · Public Annotations · Traceable Evidence</p>
          </div>
        </article>
        <p className={styles.footerNote}>
          Developed alongside my{' '}
          <Link href="/experience#projects">ongoing research</Link>. Scientific
          calculations in Amyloid Structure Analysis come from the Amyloid Candidates package.
          The annotation explorer connects your proteins to credited public resources.
        </p>
      </main>
    </>
  );
}

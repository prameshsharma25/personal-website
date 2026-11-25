import Link from 'next/link';
import Seo from '../../components/Seo';
import PageIntro from '../../components/PageIntro';
import AmyloidInspector from '../../components/AmyloidInspector';
import { PACKAGE_COMMIT, PACKAGE_URL } from '../../lib/amyloid-inspector';
import ui from '../../styles/Interface.module.css';
import styles from '../../styles/Tools.module.css';

export default function AmyloidTool() {
  return (
    <>
      <Seo
        title="Amyloid Structure Analysis: Compare, Cluster & Rank"
        description="Analyze amyloid structures from PDB or mmCIF files. Calculate descriptors, compare and cluster conformations, and review ranked candidates in your browser."
        path="/tools/amyloid-inspector"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Tools', path: '/tools' },
          {
            name: 'Amyloid Structure Analysis',
            path: '/tools/amyloid-inspector',
          },
        ]}
        schema={{
          '@type': 'SoftwareApplication',
          name: 'Amyloid Structure Analysis',
          applicationCategory: 'ScienceApplication',
          operatingSystem: 'Web Browser',
          isAccessibleForFree: true,
          url: 'https://prameshsharma.com/tools/amyloid-inspector',
          description:
            'Analyze predicted amyloid assemblies with structural descriptors, MM-align comparisons, HDBSCAN clustering, candidate ranking, and downloadable reports. Calculations run on your device with an interactive molecular viewer.',
        }}
      />
      <main className={ui.page}>
        <div className={styles.breadcrumb}>
          <Link href="/tools">← All Tools</Link>
          <span>Research Preview / Structure Analysis</span>
        </div>
        <PageIntro
          eyebrow="Amyloid Candidates / Post-Prediction Pipeline"
          title="Amyloid Structure"
          accent="Analysis."
          description="Take your predicted structures through descriptor calculations, structural comparisons, clustering, and candidate ranking. Explore the evidence and download your reports on your own device."
        />
        <AmyloidInspector />
        <section
          className={styles.method}
          aria-labelledby="interpretation-heading"
        >
          <p className={styles.kicker}>03 / Read The Evidence In Context</p>
          <h2 id="interpretation-heading">Support Is Not Confirmation.</h2>
          <p>
            The current gates describe compatibility with a reference set of
            known amyloid structures. They do not provide a calibrated
            probability that a prediction is correct or will form an amyloid.
            Missing components and ineligible results remain visible so that
            incomplete evidence is not mistaken for support.
          </p>
          <div className={styles.methodGrid}>
            <div>
              <h3>Geometry</h3>
              <p>
                Does the assembly support a repeat? Layer assignment and
                coordinate coverage determine whether direct geometry can be
                assessed.
              </p>
            </div>
            <div>
              <h3>Packing</h3>
              <p>
                How are interfaces buried and repeated? The SASA descriptor does
                not include a complete, validated shape-complementarity
                assessment.
              </p>
            </div>
            <div>
              <h3>Energetics</h3>
              <p>
                What does the empirical interchain solvation estimate suggest?
                It is one descriptor of the assembly, rather than a complete
                thermodynamic calculation.
              </p>
            </div>
          </div>
        </section>
        <section className={styles.method} aria-labelledby="package-heading">
          <p className={styles.kicker}>04 / Use The Current Package</p>
          <h2 id="package-heading">Your Pipeline. A Clearer View.</h2>
          <p>
            On My Device runs the pinned Amyloid Candidates package inside your
            browser, with NumPy, Biopython, and FreeSASA. Each structure
            receives descriptors and warnings. With batch comparisons enabled,
            MM-align runs as WebAssembly and scikit-learn HDBSCAN clusters
            comparable assemblies. Downloads include coordinates, component
            outputs, distance matrices, cluster representatives, shortlist
            eligibility, and calculation provenance.
          </p>
          <p>
            Comparisons use matching chain sequences and stoichiometries.
            Minimum Samples counts neighbors, excluding the structure itself;
            the browser adjusts scikit-learn’s setting to follow that
            convention. The backend and effective settings are recorded in each
            report. Tied distances can still lead to different partitions
            between implementations. Server Analysis retains the native hdbscan
            implementation for larger jobs; a separately configured worker is
            required for that mode. You can also run the package on your
            computer to generate reports independently of this website.
          </p>
          <p className={styles.caption}>
            Amyloid Candidates: Dr. Devlina Chakravarty, Pramesh Sharma, and Dr.
            Lauren L. Porter. Energetics adapts the{' '}
            <a
              href="https://doi.org/10.5281/zenodo.15218932"
              target="_blank"
              rel="noopener noreferrer"
            >
              Amyloid Illustrator algorithm
            </a>{' '}
            by Sawaya and Eisenberg (CC BY 4.0); see the{' '}
            <a
              href={`${PACKAGE_URL}/blob/${PACKAGE_COMMIT}/docs/ATTRIBUTION.md`}
              target="_blank"
              rel="noopener noreferrer"
            >
              package attribution
            </a>
            . Molecular rendering uses the locally hosted 3Dmol.js viewer.
          </p>
        </section>
      </main>
    </>
  );
}

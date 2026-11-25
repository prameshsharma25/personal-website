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
        title="Amyloid Warning Inspector — Structure Analysis & Clustering"
        description="Analyze PDB and mmCIF assemblies with Amyloid Candidates: structural warnings, descriptors, MM-align comparisons, clustering, and downloadable research reports."
        path="/tools/amyloid-inspector"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Tools', path: '/tools' },
          {
            name: 'Amyloid Warning Inspector',
            path: '/tools/amyloid-inspector',
          },
        ]}
        schema={{
          '@type': 'SoftwareApplication',
          name: 'Amyloid Warning Inspector',
          applicationCategory: 'ScienceApplication',
          operatingSystem: 'Web Browser',
          isAccessibleForFree: true,
          url: 'https://prameshsharma.com/tools/amyloid-inspector',
          description:
            'Analyze uploaded assemblies with Amyloid Candidates and inspect local reports in an interactive molecular viewer.',
        }}
      />
      <main className={ui.page}>
        <div className={styles.breadcrumb}>
          <Link href="/tools">← All Tools</Link>
          <span>Research Preview / Structure Analysis</span>
        </div>
        <PageIntro
          eyebrow="Amyloid Candidates / Structure Assessment"
          title="Amyloid Warning"
          accent="Inspector."
          description="Upload predicted structures to calculate amyloid descriptors, compare assemblies, and inspect the warnings alongside the evidence."
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
            The analysis service runs Amyloid Candidates on your uploaded
            coordinates. Comparable assemblies are aligned with MM-align and
            clustered with HDBSCAN. Results include individual warning reports,
            distance matrices, cluster memberships, and shortlist eligibility.
            You can also run the package locally and open its reports using Open
            Existing Reports.
          </p>
          <pre className={styles.code}>
            <code>{`# In an environment with Amyloid Candidates installed:\namyloid-structural-pipeline --structure candidate.pdb \\\n  --prediction-id candidate --output-directory results\namyloid-gates --manifest results/candidate/candidate.manifest.json \\\n  --output results/candidate/candidate.gates.json`}</code>
          </pre>
          <p>
            See the{' '}
            <a
              href={`${PACKAGE_URL}/blob/${PACKAGE_COMMIT}/README.md`}
              target="_blank"
              rel="noopener noreferrer"
            >
              package installation and pipeline instructions ↗
            </a>
            . This reader supports gate-report schema 1.0 and pipeline-manifest
            schema 1.1. The 3D view currently supports model index 0; other
            models can still be reviewed as reports.
          </p>
          <p>
            Examples were calculated with package commit{' '}
            <a
              href={`${PACKAGE_URL}/tree/${PACKAGE_COMMIT}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <code>{PACKAGE_COMMIT.slice(0, 12)}</code>
            </a>{' '}
            from its public predicted-coordinate fixtures. File paths in the
            downloadable example metadata have been made portable; descriptors
            are unchanged.
          </p>
          <p className={styles.caption}>
            Amyloid Candidates: Dr. Devlina Chakravarty, Pramesh Sharma, and Dr.
            Lauren L. Porter. Energetics adapts the Sawaya–Eisenberg{' '}
            <a
              href="https://doi.org/10.5281/zenodo.15218932"
              target="_blank"
              rel="noopener noreferrer"
            >
              Amyloid Illustrator algorithm
            </a>{' '}
            (CC BY 4.0); see the{' '}
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

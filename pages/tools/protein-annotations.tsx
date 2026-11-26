import Link from 'next/link';
import Seo from '../../components/Seo';
import PageIntro from '../../components/PageIntro';
import ProteinAnnotationExplorer from '../../components/ProteinAnnotationExplorer';
import ui from '../../styles/Interface.module.css';
import styles from '../../styles/Tools.module.css';

export default function ProteinAnnotations() {
  return (
    <>
      <Seo
        title="Protein Annotation Explorer"
        description="Select protein residues in an interactive 3D structure and sequence. Explore UniProt features and InterPro domains with reference mapping and source evidence."
        path="/tools/protein-annotations"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Tools', path: '/tools' },
          {
            name: 'Protein Annotation Explorer',
            path: '/tools/protein-annotations',
          },
        ]}
        schema={{
          '@type': 'SoftwareApplication',
          name: 'Protein Annotation Explorer',
          applicationCategory: 'ScienceApplication',
          operatingSystem: 'Web Browser',
          isAccessibleForFree: true,
          url: 'https://prameshsharma.com/tools/protein-annotations',
        }}
      />
      <main className={`${ui.page} ${styles.toolsPage}`}>
        <div className={styles.breadcrumb}>
          <Link href="/tools">← All Tools</Link>
          <span>Research Preview / Protein Annotation</span>
        </div>
        <PageIntro
          eyebrow="Tools / Sequence And Structure"
          title="Protein Annotation"
          accent="Explorer."
          description="Select a region. Explore what is known. Connect the residues in your structure to reference annotations and the evidence behind them."
        />
        <ProteinAnnotationExplorer />
        <section className={styles.method} aria-labelledby="annotation-method">
          <p className={styles.kicker}>05 / Sources And Interpretation</p>
          <h2 id="annotation-method">Keep The Evidence In View.</h2>
          <p>
            This explorer combines features from{' '}
            <a
              href="https://www.uniprot.org/help/sequence_annotation"
              target="_blank"
              rel="noopener noreferrer"
            >
              UniProt
            </a>{' '}
            and domain and family matches from{' '}
            <a
              href="https://www.ebi.ac.uk/interpro/"
              target="_blank"
              rel="noopener noreferrer"
            >
              InterPro
            </a>
            . Molecular rendering uses{' '}
            <a
              href="https://3dmol.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              3Dmol.js
            </a>
            . Each annotation links to its source; these databases and their
            contributors provide the scientific annotations.
          </p>
          <p>
            The reference accession is selected by you. Sequence alignment
            connects observed residues to that reference, retaining original
            chain and residue labels. Modified residues such as selenomethionine
            are mapped to their parent amino acid. Mapping requires at least 90%
            sequence identity and query coverage. Ambiguous placements are
            withheld. This release does not search for unknown proteins
            automatically or validate the biological identity of a sequence
            match.
          </p>
          <p>
            Only the first coordinate model and protein residues with alpha
            carbon coordinates are displayed. Hydrogen atoms, ligands, waters,
            and additional biological assembly copies are excluded from this
            view. Missing coordinates are absent from the sequence strip.
            Spatial neighborhoods use alpha carbon distances within the selected
            chain.
          </p>
          <p>
            Features describe the reference sequence. A matching residue or
            domain does not establish activity in a new variant or conformation.
            Pocket prediction, allosteric inference, and M‑CSA integration are
            not included in this release. An absent annotation means no
            annotation was found in the available sources.
          </p>
          <p>
            Sequence input supports an existing AlphaFold DB model when the full
            sequence matches exactly. No new predictions are generated. The
            lysozyme example uses{' '}
            <a
              href="https://www.rcsb.org/structure/1LYZ"
              target="_blank"
              rel="noopener noreferrer"
            >
              PDB 1LYZ
            </a>{' '}
            and a dated snapshot of public annotations for{' '}
            <a
              href="https://www.uniprot.org/uniprotkb/P00698/entry"
              target="_blank"
              rel="noopener noreferrer"
            >
              P00698
            </a>
            . Load Annotations retrieves the current provider response, which
            may be cached for up to one day.
          </p>
        </section>
      </main>
    </>
  );
}

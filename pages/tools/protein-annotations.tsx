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
        description="Annotate protein regions and compare two structures in your browser. Align conformations, explore residue differences, and connect UniProt and InterPro evidence."
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
          description="Select a region. Explore what is known. Compare two conformations and connect structural differences to reference annotations."
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
            Each comparison input accepts a PDB or mmCIF file, or a canonical
            UniProt accession. Accession loading retrieves an existing
            prediction from{' '}
            <a
              href="https://alphafold.ebi.ac.uk/"
              target="_blank"
              rel="noopener noreferrer"
            >
              AlphaFold DB
            </a>
            . Its coordinates must match the sequence reported for that model.
            The source and model version stay with the structure in exported
            reports. If a complete model is unavailable, upload a structure
            instead. No new predictions are generated.
          </p>
          <p>
            Structure comparison uses{' '}
            <a
              href="https://github.com/pylelab/USalign"
              target="_blank"
              rel="noopener noreferrer"
            >
              MM-align from the US-align software collection
            </a>{' '}
            to search for matching 3D geometry in a local browser worker. No
            sequence identity or TM score cutoff is used to reject a fit.
            Sequence Correspondence is also available and displays a
            deterministic alignment when sequence scores tie. Reference
            annotation mapping retains its separate sequence quality checks.
          </p>
          <p>
            RMSD, identity, coverage, and normalized TM scores describe the
            displayed alignment, not a probability that the proteins are
            biologically related. The structural search is heuristic. Its
            transform and residue pairing are retained in the overlay and
            exported report. Both methods use a rigid rotation with no
            reflection or flexible fitting. Missing coordinates and unpaired
            residues are excluded from the reported RMSD.
          </p>
          <p>
            The comparison example uses the RfaH C terminal domain from{' '}
            <a
              href="https://www.rcsb.org/structure/2OUG"
              target="_blank"
              rel="noopener noreferrer"
            >
              PDB 2OUG
            </a>{' '}
            and the first NMR model of the isolated domain in{' '}
            <a
              href="https://www.rcsb.org/structure/2LCL"
              target="_blank"
              rel="noopener noreferrer"
            >
              PDB 2LCL
            </a>
            . These are separate experimental structures. The overlay is not a
            simulated transition between the states.
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

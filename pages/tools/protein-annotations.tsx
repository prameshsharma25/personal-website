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
      </main>
    </>
  );
}

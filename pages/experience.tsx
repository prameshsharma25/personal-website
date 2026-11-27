import PageIntro from '../components/PageIntro';
import ui from '../styles/Interface.module.css';
import Link from 'next/link';
import Seo from '../components/Seo';
import styles from '../styles/Experience.module.css';
import ResearchProjects from '../components/ResearchProjects';

const publications = [
  {
    title:
      'AMMPER-2: A spatially explicit agent-based model of microbial radiobiology with redox dye simulation',
    source: 'bioRxiv version · 2026',
    authors:
      'Daniel Palacios, Pramesh Sharma, Madeline Marous, Danny Mejia, Lauren Liddell, Diana Gentry, Sergio Santa Maria, Jessica Lee',
    url: 'https://www.biorxiv.org/content/10.64898/2026.10.08.757403v1',
  },
  {
    title:
      'AlphaFold reveals but sometimes distorts an organizational principle of protein folding',
    source: 'bioRxiv version · 2026',
    authors:
      'Madeleine F. Clore, Joseph F. Thole, Suchetan Dontha, Pramesh Sharma, Naomi Greenberg, Marie-Paule Strub, Mary Starich, Carolyn Ott, Davin Jensen, Brian F. Volkman, Matthew Coudron, Dr. Lauren L. Porter',
    url: 'https://www.biorxiv.org/content/10.64898/2025.12.30.697132v4',
  },
  {
    title:
      'EasyDIVER+: An advanced tool for analyzing high throughput sequencing data from in vitro evolution of nucleic acids or amino acids',
    source: 'Journal of Molecular Evolution · 2025',
    authors:
      'Celia Blanco, Allison Tee, Pramesh Sharma, Matilda S. Newton, Kun-Hwa Lee, Samuel E. Erickson, Burckhard Seelig, Irene A. Chen',
    url: 'https://link.springer.com/article/10.1007/s00239-025-10244-w',
  },
];

function Authors({ names }: { names: string }) {
  const [before, after] = names.split('Pramesh Sharma');
  return (
    <>
      {before}
      <strong>Pramesh Sharma</strong>
      {after}
    </>
  );
}

export default function Experience() {
  return (
    <>
      <Seo
        title="About: Computational Biologist"
        description="Meet Pramesh Sharma, a computational biologist. Explore his background, protein structure research, NASA’s AMMPER project, and papers, or download his CV."
        path="/experience"
        schema={{
          '@type': 'ProfilePage',
          mainEntity: {
            '@type': 'Person',
            name: 'Pramesh Sharma',
            jobTitle: 'Computational Biologist',
            url: 'https://prameshsharma.com/experience',
            sameAs: ['https://github.com/prameshsharma25'],
            alumniOf: {
              '@type': 'CollegeOrUniversity',
              name: 'University of California, Davis',
            },
          },
        }}
      />
      <main className={styles.page}>
        <PageIntro
          eyebrow="About / Computational Biologist"
          title="Pramesh Sharma"
          description={
            <>
              I develop computational tools to study protein structure and
              conformational change. I’m currently a postbaccalaureate fellow in{' '}
              <a
                href="https://irp.nih.gov/pi/lauren-porter"
                target="_blank"
                rel="noopener noreferrer"
              >
                Dr. Lauren Porter
              </a>
              ’s lab at the National Institutes of Health.
            </>
          }
          aside={
            <>
              <p className={ui.miniLabel}>Current Research</p>
              <h2>Protein Structure &amp; Fold Switching</h2>
              <p>
                Dr. Lauren Porter’s Lab
                <br />
                National Institutes of Health
              </p>
              <div className={styles.researchSignals}>
                <span>Sequence</span>
                <i aria-hidden="true">→</i>
                <span>Structure</span>
                <i aria-hidden="true">→</i>
                <span>Change</span>
              </div>
              <a href="#research" className={ui.textLink}>
                Explore My Research <span aria-hidden="true">↗</span>
              </a>
            </>
          }
        >
          <div className={styles.links}>
            <a
              href="/resume.pdf"
              className={styles.resumeLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download CV <span>PDF ↗</span>
            </a>
            <a
              href="https://github.com/prameshsharma25"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub ↗
            </a>
            <Link href="/contact">Contact</Link>
          </div>
        </PageIntro>
        <nav className={styles.sectionNav} aria-label="About Page Sections">
          <a href="#background">Background</a>
          <a href="#research">Research</a>
          <a href="#projects">Projects</a>
          <a href="#publications">Papers</a>
        </nav>
        <section
          data-reveal
          id="background"
          className={styles.section}
          aria-labelledby="background-heading"
        >
          <div className={styles.sectionLabel}>
            <p className={styles.eyebrow}>01</p>
            <h2 id="background-heading">Background</h2>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.education}>
              <h3>University of California, Davis</h3>
              <p>B.S. in Computer Science · 2024</p>
            </div>
            <p>
              I started at community college before transferring to UC Davis.
              Internships at Genentech and NASA introduced me to biological
              research; a year in software engineering strengthened the skills I
              now bring to it.
            </p>
            <p>
              I was born with Pyruvate Kinase Deficiency. Living with a rare
              genetic disease shaped the questions I wanted to ask, and helped
              me see why I wanted to return to biology. I’m interested in
              understanding how molecular changes affect the way biological
              systems work.
            </p>
            <Link
              href="/posts/quitting-100k-software-job"
              className={styles.textLink}
            >
              Read About My Move From Software To Research →
            </Link>
          </div>
        </section>
        <section
          data-reveal
          id="research"
          className={styles.section}
          aria-labelledby="research-heading"
        >
          <div className={styles.sectionLabel}>
            <p className={styles.eyebrow}>02</p>
            <h2 id="research-heading">Research</h2>
          </div>
          <div className={styles.sectionBody}>
            <p className={styles.lead}>
              How can the same protein sequence support different structures?
            </p>
            <p>
              My research focuses on fold-switching proteins: proteins that can
              adopt different structures. I’m interested in how their sequences
              support those changes, and in what models such as AlphaFold
              capture or miss.
            </p>
            <p>
              I bring a software engineering background to these questions,
              building analysis pipelines and tools that help researchers
              examine model predictions.
            </p>
            <ul className={styles.topics} aria-label="Research Interests">
              <li>Protein Structure</li>
              <li>Fold Switching</li>
              <li>Interpretable Machine Learning</li>
              <li>Research Software</li>
            </ul>
          </div>
        </section>
        <ResearchProjects />
        <section
          data-reveal
          id="publications"
          className={styles.section}
          aria-labelledby="papers-heading"
        >
          <div className={styles.sectionLabel}>
            <p className={styles.eyebrow}>04</p>
            <h2 id="papers-heading">Papers &amp; Preprints</h2>
          </div>
          <div className={styles.sectionBody}>
            <ol className={styles.publicationList}>
              {publications.map((paper) => (
                <li data-reveal key={paper.url}>
                  <p className={styles.publicationSource}>{paper.source}</p>
                  <h3>
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {paper.title} <span aria-hidden="true">↗</span>
                    </a>
                  </h3>
                  <p className={styles.authors}>
                    <Authors names={paper.authors} />
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </>
  );
}

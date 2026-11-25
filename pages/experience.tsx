import Link from 'next/link';
import Seo from '../components/Seo';
import styles from '../styles/Experience.module.css';

const experiences = [
  { role: 'Postbaccalaureate Fellow', organization: 'National Institutes of Health', dates: 'Aug 2025 – Present', detail: 'Lauren Porter’s lab · Computational Biology Branch', summary: 'Developing tools to interpret AlphaFold predictions and identify fold-switching proteins, with an emphasis on reproducible analysis and research software.' },
  { role: 'Software Engineer', organization: 'Intelligent Retail Lab by Walmart', dates: 'Jul 2024 – Jul 2025', detail: 'Store Vision Services', summary: 'Built and deployed computer vision pipelines for edge devices, including model conversion, image augmentation, inference, and GPU monitoring.' },
  { role: 'Computational Biology Intern', organization: 'NASA', dates: 'Aug 2023 – Dec 2023', detail: 'Space Biosciences Research', summary: 'Worked on AMMPER, an agent-based model of microbial responses to radiation. Integrated radiobiology findings into simulations of cell behavior and viability.' },
  { role: 'Space Systems Engineering Intern', organization: 'NASA', dates: 'Aug 2022 – Dec 2022', detail: 'Systems Engineering Branch', summary: 'Developed modeling plans and digital review processes to help engineering teams document and communicate system designs.' },
  { role: 'Computational Proteomics Intern', organization: 'Genentech', dates: 'Jun 2022 – Sep 2022', detail: 'Microchemistry, Proteomics and Lipidomics', summary: 'Contributed to dataMAPPs, building tools that turn protein–peptide data into heatmaps and making the analysis easier for researchers to run.' },
  { role: 'Pharma Technical Operations Intern', organization: 'Genentech', dates: 'Jan 2022 – Jun 2022', detail: 'Manufacturing Science and Technology', summary: 'Automated on-call workflows and access management using JavaScript, PagerDuty, and Google Sheets, and documented response procedures.' },
];

const publications = [
  { title: 'AMMPER-2: A spatially explicit agent-based model of microbial radiobiology with redox dye simulation', source: 'bioRxiv version · 2026', authors: 'Daniel Palacios, Pramesh Sharma, Madeline Marous, Danny Mejia, Lauren Liddell, Diana Gentry, Sergio Santa Maria, Jessica Lee', url: 'https://www.biorxiv.org/content/10.64898/2026.10.08.757403v1' },
  { title: 'AlphaFold reveals but sometimes distorts an organizational principle of protein folding', source: 'bioRxiv version · 2026', authors: 'Madeleine F. Clore, Joseph F. Thole, Suchetan Dontha, Pramesh Sharma, Naomi Greenberg, Marie-Paule Strub, Mary Starich, Carolyn Ott, Davin Jensen, Brian F. Volkman, Matthew Coudron, Lauren L. Porter', url: 'https://www.biorxiv.org/content/10.64898/2025.12.30.697132v4' },
  { title: 'EasyDIVER+: An advanced tool for analyzing high throughput sequencing data from in vitro evolution of nucleic acids or amino acids', source: 'Journal of Molecular Evolution · 2025', authors: 'Celia Blanco, Allison Tee, Pramesh Sharma, Matilda S. Newton, Kun-Hwa Lee, Samuel E. Erickson, Burckhard Seelig, Irene A. Chen', url: 'https://link.springer.com/article/10.1007/s00239-025-10244-w' },
];

function Authors({ names }: { names: string }) {
  const [before, after] = names.split('Pramesh Sharma');
  return <>{before}<strong>Pramesh Sharma</strong>{after}</>;
}

export default function Experience() {
  return <>
    <Seo title="About — Computational Biologist" description="Computational biologist at NIH studying protein structure and fold switching. Research, papers, and experience at NIH, NASA, Genentech, and Walmart." path="/experience" schema={{ '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: 'Pramesh Sharma', jobTitle: 'Computational biologist', url: 'https://prameshsharma.com/experience', sameAs: ['https://github.com/prameshsharma25'], alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of California, Davis' } } }} />
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>ABOUT</p>
        <h1>Pramesh Sharma</h1>
        <p className={styles.role}>Computational biologist</p>
        <p className={styles.introduction}>I develop computational tools to study protein structure and conformational change. I’m currently a postbaccalaureate fellow in Lauren Porter’s lab at the National Institutes of Health.</p>
        <div className={styles.links}>
          <a href="/resume.pdf" className={styles.resumeLink} target="_blank" rel="noopener noreferrer">Download résumé <span>PDF ↗</span></a>
          <a href="https://github.com/prameshsharma25" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
          <Link href="/contact">Contact</Link>
        </div>
      </header>
      <nav className={styles.sectionNav} aria-label="About page sections">
        <a href="#research">Research</a><a href="#publications">Papers</a><a href="#experience">Experience</a><a href="#background">Background</a>
      </nav>
      <section data-reveal id="research" className={styles.section} aria-labelledby="research-heading">
        <div className={styles.sectionLabel}><p className={styles.eyebrow}>01</p><h2 id="research-heading">Research</h2></div>
        <div className={styles.sectionBody}>
          <p className={styles.lead}>How can the same protein sequence support different structures?</p>
          <p>My research focuses on fold-switching proteins: proteins that can adopt different structures. I’m interested in how their sequences support those changes, and in what models such as AlphaFold capture or miss.</p>
          <p>I bring a software engineering background to these questions, building analysis pipelines and tools that help researchers examine model predictions.</p>
          <ul className={styles.topics} aria-label="Research interests"><li>Protein structure</li><li>Fold switching</li><li>Interpretable machine learning</li><li>Research software</li></ul>
        </div>
      </section>
      <section data-reveal id="publications" className={styles.section} aria-labelledby="papers-heading">
        <div className={styles.sectionLabel}><p className={styles.eyebrow}>02</p><h2 id="papers-heading">Papers &amp; preprints</h2></div>
        <div className={styles.sectionBody}>
          <ol className={styles.publicationList}>{publications.map(paper =>
            <li data-reveal key={paper.url}>
              <p className={styles.publicationSource}>{paper.source}</p>
              <h3><a href={paper.url} target="_blank" rel="noopener noreferrer">{paper.title} <span aria-hidden="true">↗</span></a></h3>
              <p className={styles.authors}><Authors names={paper.authors} /></p>
            </li>
          )}</ol>
        </div>
      </section>
      <section data-reveal id="experience" className={styles.section} aria-labelledby="experience-heading">
        <div className={styles.sectionLabel}><p className={styles.eyebrow}>03</p><h2 id="experience-heading">Experience</h2></div>
        <div className={styles.sectionBody}>
          <ol className={styles.experienceList}>{experiences.map(item =>
            <li data-reveal key={`${item.organization}-${item.role}`}>
              <p className={styles.dates}>{item.dates}</p>
              <h3>{item.role}</h3><p className={styles.organization}>{item.organization}</p>
              <p className={styles.detail}>{item.detail}</p><p>{item.summary}</p>
            </li>
          )}</ol>
        </div>
      </section>
      <section data-reveal id="background" className={styles.section} aria-labelledby="background-heading">
        <div className={styles.sectionLabel}><p className={styles.eyebrow}>04</p><h2 id="background-heading">Background</h2></div>
        <div className={styles.sectionBody}>
          <div className={styles.education}><h3>University of California, Davis</h3><p>B.S. in Computer Science · 2024</p></div>
          <p>I started at community college before transferring to UC Davis. Internships at Genentech and NASA introduced me to biological research; a year in software engineering strengthened the skills I now bring to it.</p>
          <p>I was born with Pyruvate Kinase Deficiency. Living with a rare genetic disease shaped the questions I wanted to ask, and helped me see why I wanted to return to biology. I’m interested in understanding how molecular changes affect the way biological systems work.</p>
          <Link href="/posts/quitting-100k-software-job" className={styles.textLink}>Read about my move from software to research →</Link>
        </div>
      </section>
    </main>
  </>;
}

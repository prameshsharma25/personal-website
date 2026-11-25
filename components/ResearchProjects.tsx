import { useEffect, useRef, useState } from 'react';
import {
  researchProjects,
  type ResearchProject,
} from '../lib/research-projects';
import ProjectDiagram from './ProjectDiagram';
import styles from '../styles/ResearchProjects.module.css';

const STEP_DURATION = 6500;

function ProjectCard({
  project,
  index,
}: {
  project: ResearchProject;
  index: number;
}) {
  const root = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const running = playing && visible && pageVisible;
  const prefix = `project-${project.id}`;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReady(true);
    setPlaying(!preference.matches);
    const reduce = () => {
      if (preference.matches) setPlaying(false);
    };
    const visibility = () => setPageVisible(!document.hidden);
    visibility();
    preference.addEventListener('change', reduce);
    document.addEventListener('visibilitychange', visibility);
    // Only run walkthroughs while their visual is in view.
    const observer =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries) => setVisible(entries[0].intersectionRatio >= 0.25),
            { threshold: 0.25 }
          )
        : null;
    const visual = root.current?.querySelector('figure');
    if (observer && visual) observer.observe(visual);
    if (!observer) setVisible(true);
    return () => {
      observer?.disconnect();
      preference.removeEventListener('change', reduce);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () => setStep((current) => (current + 1) % project.steps.length),
      STEP_DURATION
    );
    return () => window.clearInterval(timer);
  }, [running, project.steps.length]);

  function selectStep(next: number) {
    setPlaying(false);
    setStep(next);
  }

  return (
    <article
      ref={root}
      id={prefix}
      data-reveal
      className={styles.card}
      data-project={project.id}
      data-running={running}
      data-step={step}
      aria-labelledby={`${prefix}-heading`}
    >
      <div className={styles.cardBody}>
        <div className={styles.copy}>
          <div className={styles.cardEyebrow}>
            <span>
              0{index + 1} / {project.field}
            </span>
            <span className={styles.status}>{project.status}</span>
          </div>
          <h3 id={`${prefix}-heading`}>{project.name}</h3>
          <p className={styles.question}>{project.question}</p>
          <p className={styles.description}>{project.description}</p>
          <ul className={styles.methods} aria-label={`${project.name} Methods`}>
            {project.methods.map((method) => (
              <li key={method}>{method}</li>
            ))}
          </ul>
          <a
            className={styles.sourceLink}
            href={project.link.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {project.link.label}
            <span aria-hidden="true"> ↗</span>
          </a>
        </div>
        <figure
          className={styles.visual}
          aria-label={`${project.name} Walkthrough`}
        >
          <div className={styles.visualHeader}>
            <span>
              <i aria-hidden="true" />
              Workflow / 0{step + 1}
            </span>
            <span>Schematic</span>
          </div>
          <ProjectDiagram
            project={project}
            step={step}
            running={running}
            visible={visible}
          />
          <figcaption className={styles.visualFooter}>
            <span>{project.steps[step].label}</span>
            {ready && (
              <button
                type="button"
                className={styles.playButton}
                onClick={() => setPlaying((value) => !value)}
                aria-label={`${playing ? 'Pause' : 'Play'} ${project.name} Walkthrough`}
              >
                <svg
                  viewBox="0 0 16 16"
                  width="13"
                  height="13"
                  aria-hidden="true"
                >
                  {playing ? (
                    <path
                      d="M4 3v10M12 3v10"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                  ) : (
                    <path d="M4 2 14 8 4 14Z" fill="currentColor" />
                  )}
                </svg>
                {playing ? 'Pause' : 'Play'}
              </button>
            )}
          </figcaption>
        </figure>
      </div>
      <div className={styles.walkthrough}>
        <ol className={styles.steps} aria-label={`${project.name} Steps`}>
          {project.steps.map((item, i) => (
            <li key={item.label}>
              <button
                type="button"
                disabled={!ready}
                onClick={() => selectStep(i)}
                aria-pressed={step === i}
                aria-controls={`${prefix}-detail`}
              >
                <span className={styles.stepNumber}>0{i + 1}</span>
                <span>{item.label}</span>
                <span className={styles.stepArrow} aria-hidden="true">
                  ↗
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div
          className={styles.stepDetail}
          id={`${prefix}-detail`}
          aria-live={playing ? 'off' : 'polite'}
          aria-atomic="true"
        >
          <span className={styles.stepCounter}>
            0{step + 1} <span>/ 04</span>
          </span>
          <div className={styles.stepDescriptions}>
            {project.steps.map((item, i) => (
              <p
                key={item.label}
                data-active={step === i}
                aria-hidden={step !== i}
              >
                {item.description}
              </p>
            ))}
          </div>
        </div>
        <noscript>
          <ol className={styles.staticSteps}>
            {project.steps.slice(1).map((item) => (
              <li key={item.label}>
                <strong>{item.label}.</strong> {item.description}
              </li>
            ))}
          </ol>
        </noscript>
      </div>
    </article>
  );
}

export default function ResearchProjects() {
  return (
    <section
      id="projects"
      className={styles.section}
      aria-labelledby="projects-heading"
    >
      <div className={styles.intro} data-reveal>
        <div>
          <p className={styles.eyebrow}>04 / Selected Work</p>
          <h2 id="projects-heading">Projects</h2>
        </div>
        <div>
          <p className={styles.lead}>
            From protein structures to life in space.
          </p>
          <p>
            I build computational tools to understand biological systems: how
            proteins change shape, how predictions can be tested, and how cells
            respond to radiation. These projects span my current research and my
            work at NASA.
          </p>
        </div>
      </div>
      <div className={styles.projectList}>
        {researchProjects.map((project, index) => (
          <ProjectCard project={project} index={index} key={project.id} />
        ))}
      </div>
      <p className={styles.figureNote}>
        The walkthroughs illustrate the methods, with example values and
        schematic groupings. The molecular cartoons use experimental reference
        coordinates: RfaH from{' '}
        <a
          href="https://www.rcsb.org/structure/2OUG"
          target="_blank"
          rel="noopener noreferrer"
        >
          2OUG
        </a>{' '}
        and{' '}
        <a
          href="https://www.rcsb.org/structure/2LCL"
          target="_blank"
          rel="noopener noreferrer"
        >
          2LCL
        </a>
        ; amyloid assemblies from{' '}
        <a
          href="https://www.rcsb.org/structure/2M4J"
          target="_blank"
          rel="noopener noreferrer"
        >
          2M4J
        </a>
        ,{' '}
        <a
          href="https://www.rcsb.org/structure/2LMN"
          target="_blank"
          rel="noopener noreferrer"
        >
          2LMN
        </a>
        , and{' '}
        <a
          href="https://www.rcsb.org/structure/2LMP"
          target="_blank"
          rel="noopener noreferrer"
        >
          2LMP
        </a>
        . These illustrate structure, not mutation or candidate-selection
        results. The AMMPER animation is a conceptual walkthrough based on{' '}
        <a
          href="https://ntrs.nasa.gov/citations/20230016450"
          target="_blank"
          rel="noopener noreferrer"
        >
          NASA’s research description
        </a>
        .
      </p>
    </section>
  );
}

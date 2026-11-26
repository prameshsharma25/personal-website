import type { ReactNode } from 'react';
import styles from '../styles/ProteinAnnotations.module.css';

export default function AnnotationTypeIcon({ category }: { category: string }) {
  const type = category.toLowerCase();
  let symbol: ReactNode;
  let color = '#98cfff';
  if (type.includes('active site')) {
    color = '#ffd28a';
    symbol = (
      <>
        <circle cx="12" cy="12" r="6" />
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
        <circle cx="12" cy="12" r="1" />
      </>
    );
  } else if (type.includes('binding')) {
    color = '#8fe3d7';
    symbol = (
      <>
        <path d="M5 4v7a7 7 0 0 0 14 0V4M5 8h4m6 0h4" />
        <path d="m12 3 3 2v4l-3 2-3-2V5Z" />
      </>
    );
  } else if (/domain|region|repeat/.test(type)) {
    symbol = (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M9 5v14m6-14v14M3 12h18" />
      </>
    );
  } else if (/family|superfamily/.test(type)) {
    color = '#c7aeff';
    symbol = (
      <>
        <circle cx="12" cy="5" r="2" />
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="18" r="2" />
        <path d="M12 7v5M5 16v-4h14v4" />
      </>
    );
  } else if (
    /variant|mutagen|conflict|alternative|sequence uncertainty/.test(type)
  ) {
    color = '#f5ace3';
    symbol = (
      <>
        <path d="M7 3v18m0-11c0 4 10 0 10 6v5M14 4l3-2 3 2m-3-2v7" />
        <circle cx="7" cy="7" r="2" />
      </>
    );
  } else if (/helix/.test(type)) {
    color = '#c7aeff';
    symbol = (
      <path d="M6 3c16 3-16 5 0 8s16 5 0 8m12-16C2 6 34 8 18 11S2 16 18 19M6 5h12M6 10h12M6 15h12M6 20h12" />
    );
  } else if (/strand/.test(type)) {
    color = '#c7aeff';
    symbol = <path d="M8 3h8v10h4l-8 8-8-8h4Z" />;
  } else if (/turn/.test(type)) {
    color = '#c7aeff';
    symbol = <path d="M6 21V9a6 6 0 0 1 12 0v7m-4-4 4 4 4-4" />;
  } else if (/bond|cross.link/.test(type)) {
    color = '#8fe3d7';
    symbol = (
      <>
        <path d="m9 15 6-6m-4-3 2-2a4 4 0 0 1 6 6l-2 2M7 12l-2 2a4 4 0 0 0 6 6l2-2" />
      </>
    );
  } else if (/modified|glycosyl|lipid|carbohyd/.test(type)) {
    color = '#ffd28a';
    symbol = (
      <>
        <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
      </>
    );
  } else if (/signal|transit|peptide/.test(type)) {
    symbol = <path d="M3 12h17m-6-6 6 6-6 6M4 5v14" />;
  } else if (/chain/.test(type)) {
    symbol = (
      <>
        <circle cx="5" cy="7" r="3" />
        <circle cx="19" cy="7" r="3" />
        <circle cx="12" cy="18" r="3" />
        <path d="m7 10 3 5m4 0 3-5M8 7h8" />
      </>
    );
  } else if (/site/.test(type)) {
    symbol = (
      <>
        <path d="M12 22s7-8 7-13a7 7 0 0 0-14 0c0 5 7 13 7 13Z" />
        <circle cx="12" cy="9" r="2" />
      </>
    );
  } else {
    symbol = (
      <>
        <path d="M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8m-8 4h5" />
      </>
    );
  }
  const label = `${category.replace(/\b\w/g, (c) => c.toUpperCase())} Annotation`;
  return (
    <svg
      className={styles.typeIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
      style={{ color }}
    >
      <title>{label}</title>
      {symbol}
    </svg>
  );
}

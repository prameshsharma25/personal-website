import type { Heading } from '../lib/article';
import styles from '../styles/Resources.module.css';
export default function ArticleContents({ headings }: { headings: Heading[] }) {
  if (headings.length < 3) return null;
  return <details className={styles.toc}><summary>On this page</summary><nav aria-label="Article contents"><ul>{headings.map(h=><li key={h.id}><a href={`#${h.id}`}>{h.label}</a></li>)}</ul></nav></details>;
}

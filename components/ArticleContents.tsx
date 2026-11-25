import { labelCase } from '../lib/labels';
import type { Heading } from '../lib/article';
import styles from '../styles/Resources.module.css';
export default function ArticleContents({ headings }: { headings: Heading[] }) {
  if (headings.length < 3) return null;
  return <details className={styles.toc}><summary>On This Page</summary><nav aria-label="Article Contents"><ul>{headings.map(h=><li key={h.id}><a href={`#${h.id}`}>{labelCase(h.label)}</a></li>)}</ul></nav></details>;
}

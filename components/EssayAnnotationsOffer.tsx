import styles from '../styles/EssayAnnotationsOffer.module.css';
import resource from '../styles/Resources.module.css';

export default function EssayAnnotationsOffer({ purchaseUrl }: { purchaseUrl: string | null }) {
  return (
    <aside className={styles.offer} aria-labelledby="annotations-heading" data-reveal>
      <div className={styles.edition} aria-hidden="true">
        <span>THE ANNOTATED EDITION</span>
        <p>Behind<br />the <em>essay.</em></p>
        <div className={styles.rule} />
        <span>PRAMESH SHARMA</span>
      </div>
      <div className={styles.details}>
        <p className={resource.eyebrow}>MY UC ESSAY / ANNOTATIONS</p>
        <h2 id="annotations-heading">Why I Wrote It This Way</h2>
        <p>The complete essay above is free to read. In the annotated edition, I walk through the writing decisions behind it, from the opening to the final line.</p>
        <ul>
          <li>My paragraph-by-paragraph commentary</li>
          <li>Notes on structure, detail, and recurring themes</li>
          <li>Reflections to consider while revising your own essay</li>
        </ul>
        <div className={styles.purchase}>
          <p className={styles.price}>$5 <span>PDF · One-Time Purchase</span></p>
          {purchaseUrl ? (
            <a className={resource.primaryButton} href={purchaseUrl} rel="noopener noreferrer">
              Get The Annotations — $5 <span aria-hidden="true">↗</span>
            </a>
          ) : <p className={styles.status}>Paid Edition Coming Soon</p>}
        </div>
        <p className={styles.note}>{purchaseUrl
          ? 'Checkout and PDF delivery through Gumroad. Your purchase includes a copy of the free essay for reference.'
          : 'The annotations are reserved for the paid edition. Purchasing will open here when it is available.'}</p>
      </div>
    </aside>
  );
}

import { Book } from '../lib/books';
import styles from '../styles/BookCard.module.css';

interface BookCardProps {
  book: Book;
  index: number;
}

export default function BookCard({ book, index }: BookCardProps) {
  return (
    <div
      className={styles.card}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className={`${styles.inner} ${styles.innerDefault}`}>

        {/* Cover image */}
        <img
          src={book.coverUrl}
          alt={`${book.title} cover`}
          className={styles.image}
          onError={(e) => {
            const target = e.currentTarget;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
        <div className={styles.fallback} style={{ display: 'none' }}>
          📚
        </div>

        {/* Now Reading badge */}
        {book.status === 'reading' && (
          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            Now Reading
          </div>
        )}

        {/* Hover overlay */}
        <div className={styles.overlay}>
          <p className={styles.overlayTitle}>{book.title}</p>
          <p className={styles.overlayAuthor}>{book.author}</p>
          {book.rating && (
            <p className={styles.overlayRating}>
              <span className={styles.starFilled}>{'★'.repeat(book.rating)}</span>
              <span className={styles.starEmpty}>{'★'.repeat(5 - book.rating)}</span>
            </p>
          )}
          {book.description && (
            <p className={styles.overlayDescription}>{book.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
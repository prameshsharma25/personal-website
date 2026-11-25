import Image from 'next/image';
import { useState } from 'react';
import type { Book } from '../lib/books';
import styles from '../styles/BookCard.module.css';

export default function BookCard({
  book,
  index,
}: {
  book: Book;
  index: number;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <article
      data-reveal
      data-reveal-delay={(index % 4) * 60}
      data-tilt
      className={styles.card}
    >
      <div className={styles.cover}>
        {coverFailed ? (
          <div className={styles.fallback}>
            <span>The Bookshelf</span>
            <strong>{book.title}</strong>
            <span>{book.author}</span>
          </div>
        ) : (
          <Image
            className={styles.image}
            src={book.coverUrl}
            alt={`${book.title} cover`}
            width={300}
            height={450}
            sizes="(max-width: 540px) 90vw, (max-width: 900px) 45vw, 25vw"
            onError={() => setCoverFailed(true)}
          />
        )}
        {book.status === 'reading' && (
          <span className={styles.badge}>Now Reading</span>
        )}
      </div>
      <div className={styles.body}>
        <h2>{book.title}</h2>
        <p className={styles.author}>{book.author}</p>
        {book.rating && (
          <p
            className={styles.rating}
            aria-label={`My Rating: ${book.rating} Out Of 5`}
          >
            <span aria-hidden="true">
              {'★'.repeat(book.rating)}
              {'☆'.repeat(5 - book.rating)}
            </span>
          </p>
        )}
        {book.description && (
          <details className={styles.details}>
            <summary>
              About This Book <span aria-hidden="true">↗</span>
            </summary>
            <p>{book.description}</p>
          </details>
        )}
      </div>
    </article>
  );
}

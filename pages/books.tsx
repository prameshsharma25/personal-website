import { useState } from 'react';
import Seo from '../components/Seo';
import PageIntro from '../components/PageIntro';
import ChoiceGroup from '../components/ChoiceGroup';
import BookCard from '../components/BookCard';
import { books } from '../lib/books';
import ui from '../styles/Interface.module.css';
import styles from '../styles/Books.module.css';
import resource from '../styles/Resources.module.css';

export default function Books() {
  const [status, setStatus] = useState('completed');
  const [query, setQuery] = useState('');
  const reading = books.filter((book) => book.status === 'reading');
  const completed = books.filter((book) => book.status === 'completed');
  const visible = books.filter(
    (book) =>
      book.status === status &&
      `${book.title} ${book.author}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  );
  return (
    <>
      <Seo
        title="Reading List: Science Fiction, Science & Stories"
        description="Explore Pramesh Sharma’s reading list, including science fiction, space exploration, and stories about the human experience."
        path="/books"
      />
      <main className={ui.page}>
        <PageIntro
          eyebrow="The Bookshelf"
          title="Other Worlds."
          accent="New Perspectives."
          description="Science fiction, science, and stories I’m spending time with. A few have stayed with me long after the last page."
          aside={
            <>
              <p className={ui.miniLabel}>On My Desk</p>
              {reading.length ? (
                <>
                  <h2>{reading[0].title}</h2>
                  <p>{reading[0].author}</p>
                  <a
                    href="#bookshelf"
                    onClick={() => {
                      setStatus('reading');
                      setQuery('');
                    }}
                    className={ui.textLink}
                  >
                    Explore The Reading Shelf <span aria-hidden="true">↗</span>
                  </a>
                </>
              ) : (
                <>
                  <h2>Between Books</h2>
                  <p>Explore the books I’ve finished below.</p>
                </>
              )}
              <div className={ui.statRow}>
                <div>
                  <strong>{completed.length}</strong>
                  <span>Completed</span>
                </div>
                <div>
                  <strong>{reading.length}</strong>
                  <span>Reading</span>
                </div>
              </div>
            </>
          }
        />
        <section
          id="bookshelf"
          className={ui.section}
          aria-label="Browse Books"
        >
          <div className={ui.toolbar}>
            <ChoiceGroup
              label="Filter Books By Status"
              value={status}
              onChange={setStatus}
              options={[
                {
                  value: 'completed',
                  label: 'Completed',
                  count: completed.length,
                },
                { value: 'reading', label: 'Reading', count: reading.length },
              ]}
            />
            <label className={ui.search}>
              Search Books
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search By Title Or Author"
              />
            </label>
          </div>
          <p className={ui.results} role="status">
            {visible.length} {visible.length === 1 ? 'Book' : 'Books'} ·{' '}
            {status === 'reading' ? 'Reading' : 'Completed'}
          </p>
          {visible.length ? (
            <div key={status} className={`${styles.shelf} ${ui.listEntrance}`}>
              {visible.map((book, index) => (
                <BookCard key={book.id} book={book} index={index} />
              ))}
            </div>
          ) : (
            <div className={ui.empty}>
              <h2>No Matching Books</h2>
              <p>Try another title or author, or explore the other shelf.</p>
              {query && (
                <button
                  type="button"
                  className={resource.secondaryButton}
                  onClick={() => setQuery('')}
                >
                  Clear Search
                </button>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

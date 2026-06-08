import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import BookCard from '../components/BookCard';
import { books } from '../lib/books';
import styles from '../styles/Books.module.css';

interface PillToggleProps {
  activeTab: 'reading' | 'completed';
  setActiveTab: (tab: 'reading' | 'completed') => void;
  completedCount: number;
  readingCount: number;
}

function PillToggle({ activeTab, setActiveTab, completedCount, readingCount }: PillToggleProps) {
  const btn1Ref = useRef<HTMLButtonElement>(null);
  const btn2Ref = useRef<HTMLButtonElement>(null);
  const [sliderStyle, setSliderStyle] = useState({ left: 4, width: 0 });

  const updateSlider = (tab: 'reading' | 'completed') => {
    const btn = tab === 'completed' ? btn1Ref.current : btn2Ref.current;
    if (btn) setSliderStyle({ left: btn.offsetLeft, width: btn.offsetWidth });
  };

  useEffect(() => { updateSlider(activeTab); }, [activeTab]);
  useEffect(() => { updateSlider('completed'); }, []);

  const tabs = [
    { key: 'completed' as const, label: 'Completed', count: completedCount, ref: btn1Ref },
    { key: 'reading'   as const, label: 'Reading',   count: readingCount,   ref: btn2Ref },
  ];

  return (
    <div className={styles.pillTrack}>
      <div
        className={styles.pillSlider}
        style={{ left: sliderStyle.left, width: sliderStyle.width }}
      />
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            ref={tab.ref}
            onClick={() => setActiveTab(tab.key)}
            className={`${styles.pillBtn} ${isActive ? styles.pillBtnActive : styles.pillBtnInactive}`}
          >
            {tab.label}
            <span className={`${styles.pillCount} ${isActive ? styles.pillCountActive : styles.pillCountInactive}`}>
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function Books() {
  const [activeTab, setActiveTab] = useState<'reading' | 'completed'>('completed');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const readingBooks   = books.filter(b => b.status === 'reading');
  const completedBooks = books.filter(b => b.status === 'completed');
  const displayedBooks = activeTab === 'reading' ? readingBooks : completedBooks;

  return (
    <>
      <Head>
        <title>Books | Pramesh Sharma</title>
        <meta name="description" content="Explore the books I'm reading and have completed." />
        <link rel="canonical" href="https://prameshsharma.com/books" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prameshsharma.com/books" />
        <meta property="og:title" content="Books | Pramesh Sharma" />
        <meta property="og:description" content="Explore the books I'm reading and have completed." />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Books | Pramesh Sharma" />
        <meta name="twitter:description" content="Explore the books I'm reading and have completed." />
      </Head>

      <main className={styles.main}>
        <div className={styles.container}>

          <div className={styles.toggleRow}>
            <PillToggle
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              completedCount={completedBooks.length}
              readingCount={readingBooks.length}
            />
          </div>

          {mounted && displayedBooks.length > 0 ? (
            <div key={activeTab} className={styles.masonry}>
              {displayedBooks.map((book, i) => (
                <BookCard key={book.id} book={book} index={i} />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Nothing here yet — check back soon.</p>
          )}

        </div>
      </main>
    </>
  );
}
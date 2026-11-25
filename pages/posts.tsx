import Link from 'next/link';
import { useState } from 'react';
import type { GetStaticProps } from 'next';
import Seo from '../components/Seo';
import PageIntro from '../components/PageIntro';
import ChoiceGroup from '../components/ChoiceGroup';
import { getAllPosts, type PostMetadata } from '../lib/posts';
import { labelCase } from '../lib/labels';
import ui from '../styles/Interface.module.css';
import styles from '../styles/Posts.module.css';
import resource from '../styles/Resources.module.css';

interface Props {
  posts: Omit<PostMetadata, 'content'>[];
}
export default function Posts({ posts }: Props) {
  const [category, setCategory] = useState('All posts');
  const [query, setQuery] = useState('');
  const categories = [
    'All posts',
    ...new Set(posts.map((post) => post.category)),
  ];
  const visible = posts.filter(
    (post) =>
      (category === 'All posts' || post.category === category) &&
      `${post.title} ${post.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  );
  return (
    <>
      <Seo
        title="Research Careers, Personal Essays & Reading"
        description="Read Pramesh Sharma’s essays on research careers, NIH and NASA experiences, community college, chronic illness, books, and finding direction."
        path="/posts"
      />
      <main className={ui.page}>
        <PageIntro
          eyebrow="Essays & Reflections"
          title="Notes From"
          accent="The Path."
          description={
            <>
              Research, education, books, and the experiences that connect them.
              These are the things I’ve learned along the way.
            </>
          }
          aside={
            <>
              <p className={ui.miniLabel}>A Place To Begin</p>
              <h2>Finding Your Way Into Research?</h2>
              <p>
                I’ve written about finding a lab, sending that first email,
                and deciding to change direction as I’ve taken those steps.
              </p>
              <Link
                href="/posts/how-i-found-an-nih-postbac-lab"
                className={ui.textLink}
              >
                How I Found My NIH Lab <span aria-hidden="true">↗</span>
              </Link>
              <div className={ui.statRow}>
                <div>
                  <strong>{posts.length}</strong>
                  <span>Essays</span>
                </div>
                <div>
                  <strong>{categories.length - 1}</strong>
                  <span>Topics To Explore</span>
                </div>
              </div>
            </>
          }
        />
        <section className={ui.section} aria-label="Browse Essays">
          <div className={ui.toolbar}>
            <ChoiceGroup
              label="Filter Posts By Topic"
              value={category}
              onChange={setCategory}
              options={categories.map((value) => ({
                value,
                label: labelCase(value),
                count:
                  value === 'All posts'
                    ? posts.length
                    : posts.filter((post) => post.category === value).length,
              }))}
            />
            <label className={ui.search}>
              Search Essays
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search By Title Or Topic"
              />
            </label>
          </div>
          <p className={ui.results} role="status">
            {visible.length} {visible.length === 1 ? 'Essay' : 'Essays'}
            {category !== 'All posts' && ` · ${labelCase(category)}`}
          </p>
          {visible.length ? (
            <div className={`${ui.grid} ${ui.listEntrance}`} key={category}>
              {visible.map((post, index) => (
                <article
                  data-tilt
                  data-reveal
                  data-reveal-delay={(index % 2) * 70}
                  key={post.slug}
                  className={`${ui.panel} ${styles.collectionCard}`}
                >
                  <div className={ui.meta}>
                    <span>{labelCase(post.category)}</span>
                    <span aria-hidden="true">↗</span>
                  </div>
                  <h2>
                    <Link href={`/posts/${post.slug}`}>{post.title}</Link>
                  </h2>
                  <p>{post.description}</p>
                  <div className={styles.collectionFooter}>
                    {post.date && (
                      <time dateTime={post.date}>
                        {new Date(post.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </time>
                    )}
                    <Link
                      href={`/posts/${post.slug}`}
                      className={ui.textLink}
                      aria-label={`Read ${post.title}`}
                    >
                      Read Essay <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={ui.empty}>
              <h2>No Matching Essays</h2>
              <p>Try another word or explore all the topics.</p>
              <button
                className={resource.secondaryButton}
                type="button"
                onClick={() => {
                  setCategory('All posts');
                  setQuery('');
                }}
              >
                Reset Filters
              </button>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: {
    posts: getAllPosts().map(({ content, ...post }) => {
      void content;
      return post;
    }),
  },
  revalidate: 60,
});

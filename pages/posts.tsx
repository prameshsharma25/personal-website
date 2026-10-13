import Link from 'next/link';
import { GetStaticProps } from 'next';
import Seo from '../components/Seo';
import styles from '../styles/Posts.module.css';
import { getAllPosts, PostMetadata } from '../lib/posts';

interface Props { posts: Omit<PostMetadata, 'content'>[] }

export default function Posts({ posts }: Props) {
  return (
    <>
      <Seo title="Posts" description="Essays by Pramesh Sharma on research, NASA internships, community college, and finding a path in science." path="/posts" />
      <main className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Posts</h1>
          <p className={styles.subtitle}>Stories about research, education, and life. Also published on <a href="https://prameshsharma.substack.com">Substack</a>.</p>
        </header>
        <div className={styles.postsList}>
          {posts.length === 0 && <p>No posts found.</p>}
          {posts.map(post => (
            <article key={post.slug} className={styles.postCard}>
              {post.draft && <p className={styles.draftNotice}>Draft preview</p>}
              <h2 className={styles.postTitle}><Link href={`/posts/${post.slug}`}>{post.title}</Link></h2>
              <p className={styles.postDescription}>{post.description}</p>
              <div className={styles.postFooter}>
                {post.date && <time dateTime={post.date} className={styles.postDate}>{new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</time>}
                <Link href={`/posts/${post.slug}`} className={styles.postLink} aria-label={`Read ${post.title}`}>Read essay →</Link>
              </div>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: { posts: getAllPosts().map(({ content, ...post }) => { void content; return post; }) },
  revalidate: 60,
});

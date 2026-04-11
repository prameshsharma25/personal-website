import Head from 'next/head';
import { useEffect, useState } from 'react';
import styles from '../styles/Posts.module.css';

interface Post {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const response = await fetch('/api/substack');
        if (!response.ok) throw new Error('Failed to fetch posts');
        const data = await response.json();
        setPosts(data.posts || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div>
      <Head>
        <title>Posts - Pramesh Sharma</title>
        <meta name="description" content="My Substack posts and writings" />
      </Head>

      <main className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Posts</h1>
          <p className={styles.subtitle}>Thoughts and insights from my <a href="https://prameshsharma.substack.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', cursor: 'pointer' }}>Substack</a></p>
        </div>

        {loading && (
          <div className={styles.state}>
            <p className={styles.stateText}>Loading posts...</p>
          </div>
        )}

        {error && !loading && (
          <div className={styles.state}>
            <p className={styles.stateText}>Unable to load posts. Please try again later.</p>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className={styles.state}>
            <p className={styles.stateText}>No posts found</p>
          </div>
        )}

        {!loading && !error && posts.length > 0 && (
          <div className={styles.postsList}>
            {posts.map((post, index) => (
              <a
                key={index}
                href={post.link}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.postCard}
              >
                <div className={styles.postContent}>
                  <h2 className={styles.postTitle}>{post.title}</h2>
                  {post.description && (
                    <p className={styles.postDescription}>{post.description}</p>
                  )}
                  <div className={styles.postFooter}>
                    <time className={styles.postDate}>
                      {formatDate(post.pubDate)}
                    </time>
                    <span className={styles.postLink}>Read more →</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

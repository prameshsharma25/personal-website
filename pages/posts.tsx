import Head from 'next/head';
import { GetStaticProps } from 'next';
import { MDXRemote, MDXRemoteSerializeResult } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import styles from '../styles/Posts.module.css';
import { getAllPosts, PostMetadata } from '../lib/posts';

interface SerializedPost extends Omit<PostMetadata, 'content'> {
  content: MDXRemoteSerializeResult;
}

interface Props {
  posts: SerializedPost[];
}

export default function Posts({ posts }: Props) {


  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
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
        <meta name="description" content="My posts and writings" />
      </Head>

      <main className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Posts</h1>
          <p className={styles.subtitle}>
            Thoughts and insights published on my{' '}
            <a
              href="https://prameshsharma.substack.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'underline', cursor: 'pointer' }}
            >
              Substack
            </a>
          </p>
        </div>

        {posts.length === 0 && (
          <div className={styles.state}>
            <p className={styles.stateText}>No posts found</p>
          </div>
        )}

        {posts.length > 0 && (
          <div className={styles.postsList}>
            {posts.map((post) => (
              <article key={post.slug} className={styles.postArticle}>
                <div className={styles.postHeader}>
                  {post.substackUrl && (
                    <div className={styles.substackNote}>
                      Originally published on{' '}
                      <a
                        href={post.substackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Substack
                      </a>
                    </div>
                  )}
                  <h2 className={styles.postTitle}>{post.title}</h2>
                  {post.date && (
                    <time className={styles.postDate}>{formatDate(post.date)}</time>
                  )}
                  {post.description && (
                    <p className={styles.postDescription}>{post.description}</p>
                  )}
                </div>
                <div className={styles.postContent}>
                  <MDXRemote {...post.content} />
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const allPosts = getAllPosts();
  
  const posts = await Promise.all(
    allPosts.map(async (post) => {
      const mdxSource = await serialize(post.content || '');
      return {
        ...post,
        content: mdxSource,
      };
    })
  );

  return {
    props: { posts },
    revalidate: 60,
  };
};

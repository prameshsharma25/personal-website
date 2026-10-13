import Link from 'next/link';
import Head from 'next/head';
import { GetStaticPaths, GetStaticProps } from 'next';
import { MDXRemote, MDXRemoteSerializeResult } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import Seo from '../../components/Seo';
import { getAllPosts, getPostBySlug, PostMetadata } from '../../lib/posts';
import styles from '../../styles/Posts.module.css';

interface Props {
  post: Omit<PostMetadata, 'content'>;
  source: MDXRemoteSerializeResult;
}

export default function PostPage({ post, source }: Props) {
  return (
    <>
      <Seo title={post.title} description={post.description} path={`/posts/${post.slug}`} date={post.date} article />
      {post.draft && <Head><meta name="robots" content="noindex, nofollow" /></Head>}
      <main className={styles.container}>
        <div className={styles.postsList}>
          <Link href="/posts">← All posts</Link>
          <article>
            {post.draft && <p className={styles.draftNotice}>Draft preview — fill in the TODO sections before publishing.</p>}
            <header className={styles.postHeader}>
              <h1 className={styles.title}>{post.title}</h1>
              <p className={styles.postDescription}>{post.description}</p>
              {post.date && <time dateTime={post.date} className={styles.postDate}>{new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</time>}
              {post.substackUrl && <p className={styles.substackNote}>Originally published on <a href={post.substackUrl}>Substack</a>.</p>}
            </header>
            <div className={styles.postContent}><MDXRemote {...source} /></div>
            {post.relatedLinks.length > 0 && (
              <nav className={styles.relatedTopics} aria-label="Explore related topics">
                <h2 className={styles.postTitle}>Explore related topics</h2>
                <ul>
                  {post.relatedLinks.map(link => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}
                </ul>
              </nav>
            )}
          </article>
          <Link href="/posts">← Read more essays</Link>
        </div>
      </main>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: getAllPosts().map(post => ({ params: { slug: post.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const { content, ...post } = getPostBySlug(params?.slug as string);
  if (post.draft && process.env.NODE_ENV !== 'development') return { notFound: true };
  return { props: { post, source: await serialize(content) }, revalidate: 60 };
};

import Link from 'next/link';
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
      <main className={styles.container}>
        <div className={styles.postsList}>
          <Link href="/posts">← All posts</Link>
          <article>
            <header className={styles.postHeader}>
              <h1 className={styles.title}>{post.title}</h1>
              <p className={styles.postDescription}>{post.description}</p>
              {post.date && <time dateTime={post.date} className={styles.postDate}>{new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</time>}
              {post.substackUrl && <p className={styles.substackNote}>Originally published on <a href={post.substackUrl}>Substack</a>.</p>}
            </header>
            <div className={styles.postContent}><MDXRemote {...source} /></div>
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
  return { props: { post, source: await serialize(content) }, revalidate: 60 };
};

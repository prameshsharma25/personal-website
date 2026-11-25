import { labelCase } from '../lib/labels';
import Link from 'next/link';
import { useState } from 'react';
import type { GetStaticProps } from 'next';
import Seo from '../components/Seo';
import styles from '../styles/Posts.module.css';
import resource from '../styles/Resources.module.css';
import { getAllPosts, type PostMetadata } from '../lib/posts';
interface Props { posts: Omit<PostMetadata,'content'>[] }
export default function Posts({posts}: Props) {
  const [category,setCategory] = useState('All posts');
  const categories = ['All posts',...new Set(posts.map(p=>p.category))];
  return <><Seo title="Research Careers, Personal Essays & Reading" description="Read Pramesh Sharma’s essays on research careers, NIH and NASA experiences, community college, chronic illness, books, and finding direction." path="/posts" />
    <main className={styles.container}><header className={styles.header}><h1 className={styles.title}>Notes from the path.</h1><p className={styles.subtitle}>Research, education, books, and the experiences that connect them. For practical tools, start with the <Link href="/resources" className={resource.textLink}>resource collection</Link>.</p><div className={resource.actions} role="group" aria-label="Filter Posts By Topic">{categories.map(c=><button key={c} className={c===category?resource.primaryButton:resource.secondaryButton} onClick={()=>setCategory(c)} aria-pressed={c===category}>{labelCase(c)}</button>)}</div></header>
    <div className={styles.postsList}>{posts.filter(p=>category==='All posts'||p.category===category).map(post=><article data-tilt data-reveal key={post.slug} className={styles.postCard}><p className={resource.badge}>{labelCase(post.category)}</p><h2 className={styles.postTitle}><Link href={`/posts/${post.slug}`}>{post.title}</Link></h2><p className={styles.postDescription}>{post.description}</p><div className={styles.postFooter}>{post.date && <time dateTime={post.date} className={styles.postDate}>{new Date(post.date).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})}</time>}<Link href={`/posts/${post.slug}`} className={styles.postLink} aria-label={`Read ${post.title}`}>Read Essay →</Link></div></article>)}</div></main>
  </>;
}
export const getStaticProps: GetStaticProps<Props> = async () => ({props:{posts:getAllPosts().map(({content,...post})=>{void content;return post;})},revalidate:60});

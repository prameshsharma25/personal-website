import { labelCase } from '../../lib/labels';
import Link from 'next/link';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { MDXRemote, type MDXRemoteSerializeResult } from 'next-mdx-remote';
import Seo from '../../components/Seo';
import ReadingProgress from '../../components/ReadingProgress';
import ArticleContents from '../../components/ArticleContents';
import LabTrackerInvitation from '../../components/LabTrackerInvitation';
import AdSlot from '../../components/AdSlot';
import SubstackPostStats from '../../components/SubstackPostStats';
import WebsitePostViews from '../../components/WebsitePostViews';
import { prepareArticle, type Heading } from '../../lib/article';
import { getAllPosts, getPostBySlug, type PostMetadata } from '../../lib/posts';
import styles from '../../styles/Posts.module.css';
import resource from '../../styles/Resources.module.css';
interface Props { post: Omit<PostMetadata,'content'>; source: MDXRemoteSerializeResult; headings: Heading[]; readingMinutes: number }
export default function PostPage({ post, source, headings, readingMinutes }: Props) {
  const career = post.category === 'Research careers';
  return <>
    <Seo title={post.seoTitle || post.title} description={post.description} path={`/posts/${post.slug}`} date={post.date} article noindex={post.draft} image={`/images/social/posts-${post.slug}.png`} breadcrumbs={[{name:'Home',path:'/'},{name:'Posts',path:'/posts'},{name:post.title,path:`/posts/${post.slug}`}]} />
    <main className={styles.container}><div className={styles.postsList}>
      <nav className={resource.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/posts">Posts</Link><span>/ {labelCase(post.category)}</span></nav>
      <article>
        {post.draft && <p className={styles.draftNotice}>Draft Preview</p>}
        <header className={styles.postHeader}><p className={resource.badge}>{labelCase(post.category)}</p><h1 className={styles.title}>{post.title}</h1><p className={styles.postDescription}>{post.description}</p>
          <p className={resource.meta}>By <Link href="/experience">Pramesh Sharma</Link> · {readingMinutes} min read{post.date && <> · <time dateTime={post.date}>{new Date(post.date).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})}</time></>}</p>
          {post.substackUrl && <p className={styles.substackNote}>Also published on <a href={post.substackUrl}>Substack</a>.</p>}
        </header>
        {post.slug === 'how-i-found-an-nih-postbac-lab' && <LabTrackerInvitation source={`post_${post.slug}`} />}
        <ReadingProgress /><ArticleContents headings={headings} />
        <div className={styles.postContent}><MDXRemote {...source} /></div>
        {!post.draft && <WebsitePostViews key={post.slug} slug={post.slug} />}
        {post.substackUrl && !post.draft && <SubstackPostStats key={post.slug} slug={post.slug} url={post.substackUrl} />}
        {post.relatedLinks.length > 0 && <nav className={styles.relatedTopics} aria-label="Related Reading"><h2 className={styles.postTitle}>Continue Exploring</h2><ul>{post.relatedLinks.map(link=><li key={link.href}><Link href={link.href}>{labelCase(link.label)}</Link></li>)}</ul></nav>}
      </article>
      {career && post.slug !== 'how-i-found-an-nih-postbac-lab' && <LabTrackerInvitation source={`post_${post.slug}`} />}
      <AdSlot /><Link href="/posts" className={resource.textLink}>← Read More Essays</Link>
    </div></main>
  </>;
}
export const getStaticPaths: GetStaticPaths = async () => ({ paths:getAllPosts().map(post=>({params:{slug:post.slug}})), fallback:false });
export const getStaticProps: GetStaticProps<Props> = async ({params}) => {
  const {content,...post} = getPostBySlug(params?.slug as string);
  if (post.draft && process.env.NODE_ENV !== 'development') return {notFound:true};
  if (!post.relatedLinks.length) post.relatedLinks = [{label:'Research guides and free tools',href:'/resources'},{label:'More personal essays',href:'/posts'}];
  return {props:{post,...await prepareArticle(content)},revalidate:60};
};

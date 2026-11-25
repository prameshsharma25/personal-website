import Link from 'next/link';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { MDXRemote, type MDXRemoteSerializeResult } from 'next-mdx-remote';
import Seo from '../../components/Seo';
import ReadingProgress from '../../components/ReadingProgress';
import ArticleContents from '../../components/ArticleContents';
import LabTrackerInvitation from '../../components/LabTrackerInvitation';
import AdSlot from '../../components/AdSlot';
import { prepareArticle, type Heading } from '../../lib/article';
import { getGuideBySlug, getAllGuides, type GuideMetadata } from '../../lib/guides';
import styles from '../../styles/Guide.module.css';
import resource from '../../styles/Resources.module.css';
interface Props { guide: GuideMetadata; source: MDXRemoteSerializeResult; allGuides: GuideMetadata[]; headings: Heading[]; readingMinutes: number }
export default function GuidePage({guide,source,allGuides,headings,readingMinutes}: Props) {
  const components = {
    h2: (props: Record<string, unknown>) => <h2 className={styles.h2} {...props} />,
    h3: (props: Record<string, unknown>) => <h3 className={styles.h3} {...props} />,
    p: (props: Record<string, unknown>) => <p className={styles.p} {...props} />,
    ul: (props: Record<string, unknown>) => <ul className={styles.ul} {...props} />,
    ol: (props: Record<string, unknown>) => <ol className={styles.ol} {...props} />,
    li: (props: Record<string, unknown>) => <li className={styles.li} {...props} />,
    blockquote: (props: Record<string, unknown>) => <blockquote className={styles.blockquote} {...props} />,
    code: (props: Record<string, unknown>) => <code className={styles.code} {...props} />,
    pre: (props: Record<string, unknown>) => <pre className={styles.pre} {...props} />,
    a: (props: Record<string, unknown>) => <a className={styles.a} {...props} />,
  };
  return <><Seo title={guide.seoTitle || guide.title} description={guide.description} path={`/mentorship/${guide.slug}`} date={guide.date} article image={`/images/social/guides-${guide.slug}.png`} breadcrumbs={[{name:'Home',path:'/'},{name:'Resources',path:'/resources'},{name:guide.title,path:`/mentorship/${guide.slug}`}]} />
    <main className={styles.container}><nav className={resource.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/resources">Resources</Link><span>/ Guide</span></nav>
      <article className={styles.article}><header className={styles.header}><p className={resource.eyebrow}>RESEARCH & APPLICATION GUIDES</p><h1 className={styles.title}>{guide.title}</h1><p className={styles.description}>{guide.description}</p><p className={resource.meta}>By <Link href="/experience">Pramesh Sharma</Link> · {readingMinutes} min read{guide.date && <> · <time dateTime={guide.date}>{new Date(guide.date).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})}</time></>}</p></header>
      {guide.slug === 'cold-emailing' && <LabTrackerInvitation source="guide_cold-emailing" />}<ReadingProgress /><ArticleContents headings={headings}/><div className={styles.content}><MDXRemote {...source} components={components}/></div></article>
      {guide.slug === 'phd-toolkit' && <aside className={resource.callout}><p className={resource.eyebrow}>FROM MY APPLICATION WRITING / $5</p><h2>Read my statement of purpose and personal statement.</h2><p>Two complete essays in PDF, with a reading note on research, motivation, and the choices behind an application.</p><Link href="/resources/phd-essay-bundle" className={resource.textLink}>Explore The Essay Bundle →</Link></aside>}
      <aside className={styles.sidebar}><h2 className={styles.sidebarTitle}>Other Guides</h2><ul className={styles.guidesList}>{allGuides.filter(g=>g.slug!==guide.slug).map(g=><li key={g.slug}><Link href={`/mentorship/${g.slug}`} className={styles.guideLink}>{g.title}</Link></li>)}</ul></aside>
      <AdSlot />
    </main></>;
}
export const getStaticProps: GetStaticProps<Props> = async ({params}) => {
  const {content,...guide} = getGuideBySlug(params?.slug as string);
  return {props:{guide,allGuides:getAllGuides(),...await prepareArticle(content)},revalidate:3600};
};
export const getStaticPaths: GetStaticPaths = async () => ({paths:getAllGuides().map(g=>({params:{slug:g.slug}})),fallback:false});

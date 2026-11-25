import Head from 'next/head';
import { SITE_NAME, SITE_URL } from '../lib/site';
export { SITE_URL } from '../lib/site';
interface Props {
  title: string; description: string; path: string; article?: boolean; date?: string; image?: string; noindex?: boolean;
  breadcrumbs?: { name: string; path: string }[]; schema?: Record<string, unknown>;
}
export default function Seo({ title, description, path, article, date, image = '/images/social/site.png', noindex = false, breadcrumbs, schema }: Props) {
  const url = `${SITE_URL}${path}`, fullTitle = `${title} | ${SITE_NAME}`, imageUrl = `${SITE_URL}${image}`;
  const graph: Record<string, unknown>[] = [
    ...(article ? [{ '@type': 'Article', headline: title, description, url, mainEntityOfPage: url, image: imageUrl,
      ...(date ? { datePublished: date } : {}), author: { '@type': 'Person', name: SITE_NAME, url: `${SITE_URL}/experience` } }] : []),
    ...(breadcrumbs ? [{ '@type': 'BreadcrumbList', itemListElement: breadcrumbs.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: `${SITE_URL}${item.path}` })) }] : []),
    ...(schema ? [schema] : []),
  ];
  return <Head>
    <title>{fullTitle}</title>
    <meta name="description" content={description} key="description" />
    <meta name="viewport" content="width=device-width, initial-scale=1" key="viewport" />
    <meta name="robots" content={noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'} key="robots" />
    <link rel="canonical" href={url} key="canonical" />
    <link rel="alternate" type="application/rss+xml" title="Pramesh Sharma — essays and research guides" href={`${SITE_URL}/feed.xml`} />
    <meta property="og:site_name" content={SITE_NAME} /><meta property="og:locale" content="en_US" />
    <meta property="og:title" content={fullTitle} /><meta property="og:description" content={description} />
    <meta property="og:url" content={url} /><meta property="og:type" content={article ? 'article' : 'website'} />
    <meta property="og:image" content={imageUrl} /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content={title} />
    {article && date && <meta property="article:published_time" content={date} />}
    <meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content={fullTitle} />
    <meta name="twitter:description" content={description} /><meta name="twitter:image" content={imageUrl} />
    {graph.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') }} />}
  </Head>;
}

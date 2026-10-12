import Head from 'next/head';

export const SITE_URL = 'https://prameshsharma.com';

interface Props {
  title: string;
  description: string;
  path: string;
  article?: boolean;
  date?: string;
}

export default function Seo({ title, description, path, article = false, date }: Props) {
  const url = `${SITE_URL}${path}`;
  const fullTitle = `${title} | Pramesh Sharma`;
  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={description} key="description" />
      <link rel="canonical" href={url} key="canonical" />
      <meta property="og:title" content={fullTitle} key="og:title" />
      <meta property="og:description" content={description} key="og:description" />
      <meta property="og:url" content={url} key="og:url" />
      <meta property="og:type" content={article ? 'article' : 'website'} key="og:type" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {article && (
        <script type="application/ld+json" key="article-schema" dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: title,
            description,
            url,
            mainEntityOfPage: url,
            ...(date ? { datePublished: date } : {}),
            author: { '@type': 'Person', name: 'Pramesh Sharma', url: SITE_URL },
          }).replace(/</g, '\\u003c'),
        }} />
      )}
    </Head>
  );
}

import type { GetServerSideProps } from 'next';
import { getAllPosts } from '../lib/posts';
import { getAllGuides } from '../lib/guides';
import { SITE_URL } from '../components/Seo';

export default function Sitemap() { return null; }

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const paths = [
    '/', '/experience', '/posts', '/mentorship', '/books', '/research-opportunities', '/contact', '/privacy',
    ...getAllPosts().map(post => `/posts/${encodeURIComponent(post.slug)}`),
    ...getAllGuides().map(guide => `/mentorship/${encodeURIComponent(guide.slug)}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${SITE_URL}${path}</loc></url>`).join('')}</urlset>`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.write(xml);
  res.end();
  return { props: {} };
};

import type { GetServerSideProps } from 'next';
import { getAllPosts } from '../lib/posts';
import { getAllGuides } from '../lib/guides';
import { SITE_URL } from '../lib/site';
export default function Feed() { return null; }
const xml = (value:string) => value.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export const getServerSideProps: GetServerSideProps = async ({res}) => {
  const articles = [...getAllPosts().filter(p=>!p.draft).map(p=>({...p,path:`/posts/${p.slug}`})),...getAllGuides().map(g=>({...g,path:`/mentorship/${g.slug}`}))].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const items = articles.map(a=>`<item><title>${xml(a.title)}</title><link>${SITE_URL}${a.path}</link><guid isPermaLink="true">${SITE_URL}${a.path}</guid><description>${xml(a.description)}</description>${a.date?`<pubDate>${new Date(a.date).toUTCString()}</pubDate>`:''}</item>`).join('');
  res.setHeader('Content-Type','application/rss+xml; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=3600');
  res.end(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Pramesh Sharma — essays and research guides</title><link>${SITE_URL}</link><description>Research, career transitions, and personal essays.</description><language>en-us</language><atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`);
  return {props:{}};
};

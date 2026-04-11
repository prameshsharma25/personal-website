import type { NextApiRequest, NextApiResponse } from 'next';

interface SubstackPost {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

type ResponseData = {
  posts?: SubstackPost[];
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const feedUrl = 'https://prameshsharma.substack.com/feed';
    const response = await fetch(feedUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch Substack feed: ${response.status}`);
    }

    const xml = await response.text();
    const posts = parseRSSFeed(xml);

    res.status(200).json({ posts });
  } catch (error) {
    console.error('Error fetching Substack posts:', error);
    res.status(500).json({
      error: 'Failed to fetch posts',
      posts: []
    });
  }
}

function parseRSSFeed(xml: string): SubstackPost[] {
  const posts: SubstackPost[] = [];

  // Extract all item elements
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemContent = itemMatch[1];

    // Extract title
    const titleMatch = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/.exec(itemContent);
    const title = titleMatch ? titleMatch[1] : '';

    // Extract description
    const descMatch = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/.exec(itemContent);
    let description = descMatch ? descMatch[1] : '';
    // Remove HTML tags from description
    description = description.replace(/<[^>]*>/g, '').trim();
    if (description.length > 200) {
      description = description.substring(0, 200) + '...';
    }

    // Extract link
    const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(itemContent);
    const link = linkMatch ? linkMatch[1] : '';

    // Extract pub date
    const pubDateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(itemContent);
    const pubDate = pubDateMatch ? pubDateMatch[1] : '';

    if (title && link) {
      posts.push({
        title,
        description,
        link,
        pubDate,
      });
    }
  }

  return posts;
}

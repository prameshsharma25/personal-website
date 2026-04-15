import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const postsDirectory = path.join(process.cwd(), 'posts');

export interface PostMetadata {
  title: string;
  description: string;
  date?: string;
  substackUrl?: string;
  slug: string;
  content?: string;
}

export interface Post extends PostMetadata {
  content: string;
}

export function getPostBySlug(slug: string): Post {
  const filePath = path.join(postsDirectory, `${slug}.mdx`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Post not found: ${slug}`);
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContent);

  return {
    slug,
    title: data.title || 'Untitled',
    description: data.description || '',
    date: data.date,
    substackUrl: data.substackUrl,
    content,
  };
}

export function getAllPosts(): PostMetadata[] {
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }

  const files = fs.readdirSync(postsDirectory);
  const posts = files
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => {
      const slug = file.replace(/\.mdx$/, '');
      const filePath = path.join(postsDirectory, file);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(fileContent);

      return {
        slug,
        title: data.title || 'Untitled',
        description: data.description || '',
        date: data.date,
        substackUrl: data.substackUrl,
        content,
      };
    })
    .sort((a, b) => {
      const dateA = new Date(a.date || '').getTime();
      const dateB = new Date(b.date || '').getTime();
      return dateB - dateA;
    });

  return posts;
}

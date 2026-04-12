import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const guidesDirectory = path.join(process.cwd(), 'guides');

export interface GuideMetadata {
  title: string;
  description: string;
  date?: string;
  slug: string;
}

export interface Guide extends GuideMetadata {
  content: string;
}

export function getGuideBySlug(slug: string): Guide {
  const filePath = path.join(guidesDirectory, `${slug}.mdx`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Guide not found: ${slug}`);
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContent);

  return {
    slug,
    title: data.title || 'Untitled',
    description: data.description || '',
    date: data.date,
    content,
  };
}

export function getAllGuides(): GuideMetadata[] {
  if (!fs.existsSync(guidesDirectory)) {
    return [];
  }

  const files = fs.readdirSync(guidesDirectory);
  const guides = files
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => {
      const slug = file.replace(/\.mdx$/, '');
      const filePath = path.join(guidesDirectory, file);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const { data } = matter(fileContent);

      return {
        slug,
        title: data.title || 'Untitled',
        description: data.description || '',
        date: data.date,
      };
    });

  return guides.sort((a, b) => {
    if (a.date && b.date) {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
    return 0;
  });
}

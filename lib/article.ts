export type Heading = { id: string; label: string };
type Node = { type?: string; tagName?: string; value?: string; children?: Node[]; properties?: Record<string, unknown> };
export function headingSlug(text: string) { return text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-') || 'section'; }
export async function prepareArticle(content: string) {
  const { serialize } = await import('next-mdx-remote/serialize');
  const headings: Heading[] = [], counts = new Map<string,number>();
  const text = (node: Node): string => node.value || node.children?.map(text).join('') || '';
  const plugin = () => (tree: Node) => {
    function visit(node: Node) {
      if (node.type === 'element' && ['h1','h2','h3'].includes(node.tagName || '')) {
        if (node.tagName === 'h1') node.tagName = 'h2';
        const label = text(node), base = headingSlug(label), count = counts.get(base) || 0;
        counts.set(base,count+1); const id = count ? `${base}-${count}` : base;
        node.properties = { ...node.properties, id };
        if (node.tagName === 'h2') headings.push({id,label});
      }
      if (node.type === 'element' && node.tagName === 'img') node.properties = { ...node.properties, loading:'lazy', decoding:'async' };
      node.children?.forEach(visit);
    }
    visit(tree);
  };
  const source = await serialize(content, { mdxOptions: { rehypePlugins: [plugin] } });
  return { source, headings, readingMinutes: Math.max(1,Math.ceil(content.split(/\s+/).length/220)) };
}

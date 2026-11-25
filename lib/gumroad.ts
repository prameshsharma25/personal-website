type GumroadProduct = 'uc-annotations' | 'phd-essays';

const publishedProducts: Record<GumroadProduct, string> = {
  'phd-essays': 'https://pramesh6.gumroad.com/l/phd-application-essays',
  'uc-annotations': 'https://pramesh6.gumroad.com/l/uc-essay-annotations',
};

// Called only from page data functions. No purchase files are served by this site.
export function gumroadProductUrl(product: GumroadProduct, env: NodeJS.ProcessEnv = process.env): string | null {
  // Published links work without host configuration; an explicit switch can pause sales.
  if ((env.GUMROAD_SALES_ENABLED ?? 'true') !== 'true') return null;
  const value = env[product === 'uc-annotations' ? 'UC_ANNOTATIONS_GUMROAD_URL' : 'PHD_ESSAYS_GUMROAD_URL'] ?? publishedProducts[product];
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'pramesh6.gumroad.com' ||
      url.port || url.username || url.password || url.search || url.hash ||
      !/^\/l\/[a-zA-Z0-9_-]+$/.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

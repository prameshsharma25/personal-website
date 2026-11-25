type GumroadProduct = 'uc-annotations' | 'phd-essays';

// Called only from page data functions. No purchase files are served by this site.
export function gumroadProductUrl(product: GumroadProduct, env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.GUMROAD_SALES_ENABLED !== 'true') return null;
  const value = env[product === 'uc-annotations' ? 'UC_ANNOTATIONS_GUMROAD_URL' : 'PHD_ESSAYS_GUMROAD_URL'];
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

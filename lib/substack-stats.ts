export const SUBSTACK_ORIGIN = 'https://prameshsharma.substack.com';

export type SubstackStats = {
  status: 'available' | 'stale' | 'unavailable';
  checkedAt: string | null;
  likes: number | null;
  comments: number | null;
  restacks: number | null;
};

export function publicPostSlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.origin !== SUBSTACK_ORIGIN ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      return null;
    return (
      /^\/p\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(parsed.pathname)?.[1] ?? null
    );
  } catch {
    return null;
  }
}

export function emptySubstackStats(): SubstackStats {
  return {
    status: 'unavailable',
    checkedAt: null,
    likes: null,
    comments: null,
    restacks: null,
  };
}

export function parseSubstackStats(
  value: unknown,
  slug: string,
  checkedAt: string
): SubstackStats {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid post');
  const data = value as Record<string, unknown>;
  if (
    data.slug !== slug ||
    publicPostSlug(String(data.canonical_url ?? '')) !== slug
  ) {
    throw new Error('Post identity mismatch');
  }
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : null;
  const stats: SubstackStats = {
    status: 'available',
    checkedAt,
    likes: count(data.reaction_count),
    comments: count(data.comment_count),
    restacks: count(data.restacks),
  };
  if (
    [stats.likes, stats.comments, stats.restacks].every(
      (value) => value === null
    )
  ) {
    throw new Error('Counts unavailable');
  }
  return stats;
}

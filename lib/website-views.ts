export type WebsiteViews = {
  status: 'available' | 'disabled' | 'unavailable';
  views: number | null;
  recorded: boolean;
};
export const emptyWebsiteViews = (
  status: 'disabled' | 'unavailable' = 'unavailable'
): WebsiteViews => ({ status, views: null, recorded: false });
export const validViewSlug = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 180 &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const validViewSession = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

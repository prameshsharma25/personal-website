import { validViewSession } from './website-views';
const SESSION_KEY = 'website-view-session-v1';
const seenKey = (slug: string) => `website-view-seen-v1:${slug}`;

// sessionStorage lasts across reloads and navigation in this tab. If storage is
// blocked, show the public total but do not invent a new session on every visit.
export function websiteViewSession(slug: string) {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!validViewSession(id)) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return { id, seen: sessionStorage.getItem(seenKey(slug)) === id };
  } catch {
    return null;
  }
}
export function rememberWebsiteView(slug: string, id: string) {
  try {
    sessionStorage.setItem(seenKey(slug), id);
  } catch {}
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
const NewsletterContext = createContext(false);
export function useNewsletterAvailable() { return useContext(NewsletterContext); }
export default function NewsletterProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/newsletter/status', { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => setAvailable(data?.available === true))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return <NewsletterContext.Provider value={available}>{children}</NewsletterContext.Provider>;
}

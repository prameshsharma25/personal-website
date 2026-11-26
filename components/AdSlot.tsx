import { useEffect, useRef } from 'react';
import styles from '../styles/AdSlot.module.css';
declare global { interface Window { adsbygoogle?: unknown[] } }
export default function AdSlot() {
  const requested = useRef(false), element = useRef<HTMLModElement>(null);
  const slot = process.env.NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT || '';
  const enabled = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === 'true' && /^\d+$/.test(slot);
  useEffect(() => {
    if (!enabled || requested.current || !element.current || element.current.getAttribute('data-adsbygoogle-status')) return;
    try { (window.adsbygoogle ||= []).push({}); requested.current = true; } catch { /* Ad blockers must not break content. */ }
  }, [enabled]);
  if (!enabled) return null;
  return <aside className={styles.slot} aria-label="Advertisement">
    <p>Advertisement</p>
    <ins ref={element} className="adsbygoogle" style={{display:'block'}} data-ad-client="ca-pub-2651199811728382" data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
  </aside>;
}

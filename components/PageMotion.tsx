import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/router';

export default function PageMotion({ children }: { children: ReactNode }) {
  const router = useRouter();
  const routePath = router.asPath.split(/[?#]/)[0];
  const root = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const start = () => setLoading(true), finish = () => setLoading(false);
    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', finish);
    router.events.on('routeChangeError', finish);
    return () => { router.events.off('routeChangeStart', start); router.events.off('routeChangeComplete', finish); router.events.off('routeChangeError', finish); };
  }, [router.events]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!('IntersectionObserver' in window)) return;
    const animations = new Set<Animation>();
    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target); seen.add(entry.target);
        // Content is visible in HTML, without JavaScript, and if animation fails.
        if (preference.matches || !('animate' in entry.target)) return;
        const element = entry.target as HTMLElement;
        const animation = element.animate([
          { opacity: .25, transform: 'translateY(20px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 650, delay: Math.min(Number(element.dataset.revealDelay) || 0, 180), easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      });
    }, { threshold: .08 });
    const observe = () => root.current?.querySelectorAll('[data-reveal]').forEach(element => { if (!seen.has(element)) observer.observe(element); });
    observe();
    // Filtered lists may add cards without navigating to another page.
    const mutations = new MutationObserver(observe);
    if (root.current) mutations.observe(root.current, { childList: true, subtree: true });
    const reduce = () => { if (preference.matches) { animations.forEach(animation => animation.cancel()); animations.clear(); } };
    preference.addEventListener('change', reduce);
    return () => { observer.disconnect(); mutations.disconnect(); animations.forEach(animation => animation.cancel()); preference.removeEventListener('change', reduce); };
  }, [routePath]);
  return <>
    <div className="routeProgress" data-loading={loading} aria-hidden="true"><span /></div>
    <div ref={root} key={routePath} id="main-content" tabIndex={-1} className="pageEntrance">{children}</div>
  </>;
}

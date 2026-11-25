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
          { opacity: 0, transform: 'perspective(1000px) translate3d(0,52px,-25px) rotateX(7deg) scale(.97)', filter: 'blur(5px)', offset: 0 },
          { opacity: 1, transform: 'perspective(1000px) translate3d(0,-3px,0) rotateX(0deg) scale(1.006)', filter: 'blur(0)', offset: .75 },
          { opacity: 1, transform: 'none', filter: 'none', offset: 1 },
        ], { duration: 850, delay: Math.min(Number(element.dataset.revealDelay) || 0, 240), easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
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
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = matchMedia('(hover: hover) and (pointer: fine)');
    let current: HTMLElement | null = null, frame = 0;
    let x = 0, y = 0;
    function reset() {
      if (frame) cancelAnimationFrame(frame); frame = 0;
      if (current) {
        current.style.removeProperty('--tilt-x'); current.style.removeProperty('--tilt-y');
        current.style.removeProperty('--pointer-x'); current.style.removeProperty('--pointer-y');
      }
      current = null;
    }
    function move(event: PointerEvent) {
      if (preference.matches || !pointer.matches) return;
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-tilt]') : null;
      if (card !== current) { reset(); current = card; }
      if (!current) return;
      x = event.clientX; y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0; if (!current) return;
        const box = current.getBoundingClientRect();
        const px = Math.max(0, Math.min(1, (x - box.left) / box.width)), py = Math.max(0, Math.min(1, (y - box.top) / box.height));
        current.style.setProperty('--tilt-x', `${(0.5 - py) * 8}deg`);
        current.style.setProperty('--tilt-y', `${(px - 0.5) * 8}deg`);
        current.style.setProperty('--pointer-x', `${px * 100}%`); current.style.setProperty('--pointer-y', `${py * 100}%`);
      });
    }
    element.addEventListener('pointermove', move, { passive: true }); element.addEventListener('pointerleave', reset);
    preference.addEventListener('change', reset);
    return () => { reset(); element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', reset); preference.removeEventListener('change', reset); };
  }, [routePath]);
  return <>
    <div key={`veil-${routePath}`} className="transitionVeil" aria-hidden="true"><span /></div>
    <div className="routeProgress" data-loading={loading} aria-hidden="true"><span /></div>
    <div ref={root} key={routePath} id="main-content" tabIndex={-1} className="pageEntrance">{children}</div>
  </>;
}

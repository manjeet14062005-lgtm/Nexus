import { lazy, useEffect } from 'react';
const routes = new Map();
export function lazyPage(paths, load) {
  let promise;
  const preload = () => {
    if (!promise) promise = load().catch(error => { promise = null; throw error; });
    return promise;
  };
  for (const path of paths) routes.set(path, preload);
  return lazy(preload);
}
export function preloadRoute(path) { return routes.get(path)?.(); }
export function useRoutePreload() {
  useEffect(() => {
    let timer;
    function intent(event) {
      clearTimeout(timer);
      if (navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '')) return;
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin || !routes.has(url.pathname)) return;
      // Import page code only. No account data or privileged requests are prefetched.
      const run = () => { preloadRoute(url.pathname)?.catch(() => {}); };
      if (event.type === 'focusin') run(); else timer = setTimeout(run, 100);
    }
    const cancel = () => clearTimeout(timer);
    document.addEventListener('pointerover', intent);
    document.addEventListener('focusin', intent);
    document.addEventListener('pointerout', cancel);
    return () => { cancel(); document.removeEventListener('pointerover', intent); document.removeEventListener('focusin', intent); document.removeEventListener('pointerout', cancel); };
  }, []);
}

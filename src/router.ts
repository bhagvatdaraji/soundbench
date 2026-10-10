import { useSyncExternalStore } from 'react';

/** Hash routing (#/rta) so it works on GitHub Pages with no server rewrites. */
const read = () => location.hash.replace(/^#\/?/, '');

export function navigate(route: string): void {
  location.hash = route ? `/${route}` : '';
}

export function useRoute(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    read,
  );
}

/**
 * Reference-data cache: memoized GETs for the small, slow-changing option lists
 * that modals need (channels, profiles, templates, boards, workflows, actions).
 *
 * Modal open latency is dominated by N sequential fetches done BEFORE the modal
 * is shown. Pages prefetch these endpoints on load (`prefetch`), and modals
 * resolve them via `cachedGet` - a cache hit resolves in the same microtask, so
 * the modal renders immediately from already-available data.
 */
import { apiGet } from "./api";

const cache = new Map<string, Promise<unknown>>();

/** GET with memoization: subsequent calls for the same path resolve instantly. */
export function cachedGet<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = apiGet<T>(path);
    // Keep the promise (not just the value) so concurrent callers share one fetch.
    cache.set(path, p);
  }
  return p;
}

/** Fire the cached GETs for a set of endpoints so later modal opens are instant. */
export function prefetch(paths: string[]): void {
  for (const p of paths) {
    void cachedGet(p);
  }
}

/** Drop a cached entry (used after mutations that change an option list). */
export function invalidateCached(path: string): void {
  cache.delete(path);
}

import type { Bundle } from './types';

/**
 * A bundle loader is a function that performs a dynamic import of a bundle
 * manifest and resolves to its default export. The dynamic-import shape is
 * what enables Vite to code-split bundles (T2/Sprint 4b will switch to
 * per-theme chunk URLs).
 */
type BundleLoader = () => Promise<{ default: Bundle }>;

/**
 * Map of registered theme IDs → bundle loader functions. Adding a new theme
 * (e.g. `'dark'`, `'blood'`, `'midnight'`) is a one-line change: wire a new
 * `() => import('./dark')` loader.
 */
const bundleLoaders: Record<string, BundleLoader> = {
  default: () => import('./default'),
  f1: () => import('./default'),
};

/**
 * In-flight cache. While a bundle is being loaded, subsequent calls return
 * the *same* Promise — preventing duplicate dynamic imports, race conditions,
 * and wasted network/CPU. Once resolved, the resolved value is reused for
 * the lifetime of the process.
 */
const inflightCache = new Map<string, Promise<Bundle>>();

/**
 * Load a bundle by theme ID. Returns the cached Promise if the same theme
 * is requested concurrently. Falls back to `'default'` when the requested
 * theme is unknown — a hard guarantee that the overlay window always has
 * components to render.
 */
export async function loadBundle(themeId: string): Promise<Bundle> {
  const cached = inflightCache.get(themeId);
  if (cached) return cached;

  const loader = bundleLoaders[themeId] ?? bundleLoaders.default;
  const promise = loader().then((mod) => mod.default);
  inflightCache.set(themeId, promise);
  return promise;
}

/** Returns the list of theme IDs that have a registered loader. */
export function getAvailableBundles(): string[] {
  return Object.keys(bundleLoaders);
}

/**
 * Test-only helper. Clears the in-flight cache so a fresh `loadBundle` call
 * re-imports the module. Production code must never call this.
 */
export function __resetBundleCache(): void {
  inflightCache.clear();
}

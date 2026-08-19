/**
 * Mirrors `basePath` in next.config.js. Client-side `fetch()` calls (unlike <Link>/router
 * navigation) aren't automatically prefixed by Next.js, so API calls need this manually.
 */
export const BASE_PATH = '/ai';

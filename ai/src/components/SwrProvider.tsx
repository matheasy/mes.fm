'use client';

import { SWRConfig } from 'swr';

/**
 * Each Next.js route ships as its own JS bundle, so without a shared cache provider here, SWR's
 * default (module-level) cache effectively resets on every client-side navigation - defeating
 * revalidateIfStale:false, since there'd be no persisted data to "not revalidate". Owning one
 * cache Map in this always-mounted layout-level provider is what actually makes "fetch once per
 * page per session, refetch only on the Refresh Data button" hold across navigation.
 *
 * shouldRetryOnError matters separately from the revalidateOnFocus / revalidateOnReconnect /
 * revalidateIfStale settings above: those only govern re-fetching successful data, while SWR's
 * automatic error retry (exponential backoff, on by default) keeps re-hitting a failing request
 * in the background regardless of them - exactly the "still trying to refresh with no
 * interaction" behavior we don't want here.
 */
export default function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}

'use client';

import { SWRConfig } from 'swr';

/**
 * Each Next.js route ships as its own JS bundle, so without a shared cache provider here, SWR's
 * default (module-level) cache effectively resets on every client-side navigation - defeating
 * revalidateIfStale:false, since there'd be no persisted data to "not revalidate". Owning one
 * cache Map in this always-mounted layout-level provider is what actually makes "fetch once per
 * page per session, refetch only on the Refresh Data button" hold across navigation.
 */
export default function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}

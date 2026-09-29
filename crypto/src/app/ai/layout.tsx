import type { Metadata } from 'next';

/** Was its own app/Vercel project until 2026-09-29; now a section of this one (code in src/apps/ai) */
export const metadata: Metadata = {
  title: 'MES AI Trading',
  description: 'Read-only multi-network (BSC, Ethereum, Arbitrum, Polygon, Hyperliquid) wallet portfolio, transaction, and capital gains tracker',
  // public, unlike the rest of this app (whose root layout sets noindex)
  robots: { index: true, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

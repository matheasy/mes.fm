import type { Metadata } from 'next';

/** Was its own app/Vercel project until 2026-09-29; now a section of this one (code in src/apps/assets) */
export const metadata: Metadata = {
  title: 'MES Assets',
  description: 'Every asset worth $10+ across Hive, Hive Engine, Magi, EVM chains, Hyperliquid and XRP - fetched once, shared with the other dashboards',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

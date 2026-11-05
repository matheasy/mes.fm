import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MES Cash LP',
  description: 'Stablecoins, the Magi BTC/HBD pool and ACE + SURGE on Hive Engine, across every wallet',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

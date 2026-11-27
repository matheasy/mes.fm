import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MES Strategy',
  description: 'The Friday routine: check weekly, rebalance on the first Friday of the month when a section leaves its band, review each quarter',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

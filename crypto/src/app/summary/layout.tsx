import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MES Summary',
  description: 'The crypto portfolio over time: every check since 2019, by section, in USD, CAD and BTC',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

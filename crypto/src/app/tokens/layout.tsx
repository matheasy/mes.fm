import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MES Tokens',
  description: 'Every other token worth $10 or more, summed across wallets',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

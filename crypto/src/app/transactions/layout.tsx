import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MES Crypto Transactions',
  description: 'Every transfer of the Main, AI Trading and MikeFA wallets',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

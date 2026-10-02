import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MES Random Small Wallets',
  description: 'Old wallets and exchange accounts kept for reference only - not counted in assets, transactions or taxes',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

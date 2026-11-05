import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MES Crypto Taxes',
  description: 'Canadian capital gains and crypto income (ACB, in CAD) across every wallet, with an overview by section',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

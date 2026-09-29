import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MES Store of Value',
  description: 'Long-term holdings - Bitcoin in every form, XRP and TGLD - across every wallet, with what they cost',
};

export default function SovLayout({ children }: { children: React.ReactNode }) {
  return children;
}

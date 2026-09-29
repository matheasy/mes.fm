import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MES Liquidity',
  description: 'Liquidity providing: the Main wallet PancakeSwap position, unharvested rewards and history',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MES Strategy',
  description: 'The Cash LP -> Tokens -> Store of Value rotation as a dated to-do list, with market signals, targets and a backtest',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

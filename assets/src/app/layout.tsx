import type { Metadata } from 'next';
import SwrProvider from '@/components/SwrProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'MES Assets',
  description: 'Every asset worth $10+ across Hive, Hive Engine, Magi, EVM chains, Hyperliquid and XRP - fetched once, shared with the other dashboards',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <SwrProvider>
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            <div className="mb-2 text-sm">
              <a href="https://mes.fm/portfolio" className="text-gray-400 hover:text-accent">
                &larr; mes.fm/portfolio
              </a>
            </div>
            <header className="mb-6">
              <h1 className="text-lg font-semibold text-gray-100">MES Assets</h1>
            </header>
            <main>{children}</main>
          </div>
        </SwrProvider>
      </body>
    </html>
  );
}

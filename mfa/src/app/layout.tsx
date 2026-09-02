import type { Metadata } from 'next';
import Link from 'next/link';
import SwrProvider from '@/components/SwrProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'MikeFA Trading',
  description: 'Read-only BSC wallet portfolio, transaction, and capital gains tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <SwrProvider>
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            <div className="mb-2 text-sm">
              <a href="https://mes.fm/crypto" className="text-gray-400 hover:text-accent">
                &larr; mes.fm/crypto
              </a>
            </div>
            <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-lg font-semibold text-gray-100">MikeFA Trading</h1>
              <nav className="flex gap-4 text-sm">
                <Link href="/" className="text-gray-300 hover:text-accent">
                  Overview
                </Link>
                <Link href="/transactions" className="text-gray-300 hover:text-accent">
                  Transactions
                </Link>
                <Link href="/gains" className="text-gray-300 hover:text-accent">
                  Gains
                </Link>
              </nav>
            </header>
            <main>{children}</main>
          </div>
        </SwrProvider>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
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
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1461238060884369"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <SwrProvider>
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
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
            <footer className="mt-10 border-t border-gray-800 pt-4 text-xs text-gray-500">
              <p>
                This site displays ads served by Google AdSense, which may use cookies to
                personalize ads. See the{' '}
                <a
                  href="https://mes.fm/privacy-policy.html"
                  className="text-gray-400 underline hover:text-accent"
                >
                  privacy policy
                </a>{' '}
                for details.
              </p>
            </footer>
          </div>
        </SwrProvider>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import SiteChrome from '@/components/SiteChrome';
import SiteFooter from '@/components/SiteFooter';
import SwrProvider from '@/components/SwrProvider';
import './globals.css';

const TITLE = 'MES Crypto Portfolio';
const TAGLINE = 'Group totals across every mes.fm wallet: AI Trading, MikeFA Trading and Store of Value.';

export const metadata: Metadata = {
  title: TITLE,
  description: 'Combined read-only portfolio, transaction, and capital gains dashboard across every tracked BSC wallet',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <SwrProvider>
          <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6">
            <SiteChrome title={TITLE} tagline={TAGLINE} partOfLabel="MES Links" partOfHref="https://mes.fm/links" />
            <nav className="mb-6 flex gap-4 text-sm">
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
            <main>{children}</main>
            <SiteFooter />
          </div>
        </SwrProvider>
        <Script src="https://mes.fm/main_js/track.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}

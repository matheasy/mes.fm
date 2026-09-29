import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import SiteChrome from '@/components/SiteChrome';
import SiteFooter from '@/components/SiteFooter';
import SwrProvider from '@/components/SwrProvider';
import './globals.css';

const TITLE = 'MES AI Trading';
const TAGLINE = 'Read-only AI wallet tracker across BSC, Ethereum, Arbitrum and Hyperliquid.';

export const metadata: Metadata = {
  title: TITLE,
  description: 'Read-only multi-network (BSC, Ethereum, Arbitrum, Hyperliquid) wallet portfolio, transaction, and capital gains tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <SwrProvider>
          <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6">
            <SiteChrome title={TITLE} tagline={TAGLINE} />
            <nav className="mb-6 flex gap-4 text-sm">
              <Link href="/" className="text-gray-300 hover:text-accent">
                Overview
              </Link>
              <a href="https://mes.fm/portfolio/transactions?wallet=ai" className="text-gray-300 hover:text-accent">
                Transactions
              </a>
              <a href="https://mes.fm/taxes?wallet=ai" className="text-gray-300 hover:text-accent">
                Taxes
              </a>
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

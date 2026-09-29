import type { Metadata } from 'next';
import Link from 'next/link';
import SiteChrome from '@/components/SiteChrome';
import SiteFooter from '@/components/SiteFooter';
import SwrProvider from '@/components/SwrProvider';
import './globals.css';

const TITLE = 'MES Store of Value';
const TAGLINE = 'Long-term Store of Value tracker: Bitcoin, XRP and TGLD.';

export const metadata: Metadata = {
  title: TITLE,
  description:
    'Read-only tracker for a fixed set of long-term holdings — Bitcoin (BTCB + WBTC), XRP, and TGLD — with combined value, transactions, and capital gains.',
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
      </body>
    </html>
  );
}

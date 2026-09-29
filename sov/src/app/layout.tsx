import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import SiteFooter from '@/components/SiteFooter';
import SwrProvider from '@/components/SwrProvider';
import ThemeScript from '@/components/ThemeScript';
import './globals.css';

const TITLE = 'MES Store of Value';
const TAGLINE = 'Long-term Store of Value tracker: Bitcoin, XRP and TGLD.';

export const metadata: Metadata = {
  title: TITLE,
  description:
    'Read-only tracker for a fixed set of long-term holdings — Bitcoin (BTCB + WBTC), XRP, and TGLD — with combined value, transactions, and capital gains.',
  icons: { icon: 'https://mes.fm/img/crypto-logo.jpg' },
  // password-protected (mes.fm/middleware.js): kept out of search engines, like mes.fm/assets
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <SwrProvider>
          <div className="mx-auto max-w-[1180px] px-4 pb-6 sm:px-6">
            <SiteChrome title={TITLE} tagline={TAGLINE} homeHref="https://mes.fm/sov" active="sov" wallet="sov" />
            <main>{children}</main>
            <SiteFooter />
          </div>
        </SwrProvider>
      </body>
    </html>
  );
}

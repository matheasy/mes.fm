import type { Metadata } from 'next';
import Script from 'next/script';
import SiteChrome from '@/components/SiteChrome';
import SiteFooter from '@/components/SiteFooter';
import SwrProvider from '@/components/SwrProvider';
import ThemeScript from '@/components/ThemeScript';
import './globals.css';

const TITLE = 'MES AI Trading';
const TAGLINE = 'Read-only AI wallet tracker across BSC, Ethereum, Arbitrum and Hyperliquid.';

export const metadata: Metadata = {
  title: TITLE,
  description: 'Read-only multi-network (BSC, Ethereum, Arbitrum, Hyperliquid) wallet portfolio, transaction, and capital gains tracker',
  icons: { icon: 'https://mes.fm/img/crypto-logo.jpg' },
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
            <SiteChrome title={TITLE} tagline={TAGLINE} homeHref="https://mes.fm/ai" active="ai" wallet="ai" />
            <main>{children}</main>
            <SiteFooter />
          </div>
        </SwrProvider>
        <Script src="https://mes.fm/main_js/track.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import Script from 'next/script';
import SiteChrome from '@/components/SiteChrome';
import SiteFooter from '@/components/SiteFooter';
import SwrProvider from '@/components/SwrProvider';
import ThemeScript from '@/components/ThemeScript';
import './globals.css';

const TITLE = 'MES Crypto Portfolio';
const TAGLINE = 'Every wallet in one place: Main, AI Trading, MikeFA Trading, Store of Value and all other assets.';

export const metadata: Metadata = {
  title: TITLE,
  description: 'Combined read-only portfolio, transaction, and capital gains dashboard across every tracked BSC wallet',
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
            {/* no `active`: Portfolio / Transactions / Taxes follow the URL (this one app serves all three) */}
            <SiteChrome title={TITLE} tagline={TAGLINE} homeHref="https://mes.fm/portfolio" />
            <main>{children}</main>
            <SiteFooter />
          </div>
        </SwrProvider>
        <Script src="https://mes.fm/main_js/track.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}

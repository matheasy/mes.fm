import type { Metadata } from 'next';
import Script from 'next/script';
import SiteChrome from '@/components/SiteChrome';
import SiteFooter from '@/components/SiteFooter';
import SwrProvider from '@/components/SwrProvider';
import ThemeScript from '@/components/ThemeScript';
import './globals.css';

const TITLE = 'MES Crypto Portfolio';
const TAGLINE = 'Every wallet in one place: Main, AI Trading, MikeFA Trading, Store of Value, Liquidity and all other assets.';

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
            {/* no `active`: the tab follows the URL - this one app serves Portfolio, Transactions, Taxes, Store of Value, Assets, AI Trading and MikeFA */}
            <SiteChrome
              title={TITLE}
              tagline={TAGLINE}
              homeHref="https://mes.fm/portfolio"
              pageTitles={{
                sov: {
                  title: 'MES Store of Value',
                  tagline: 'Long-term holdings: Bitcoin, XRP and TGLD, across every wallet.',
                  homeHref: 'https://mes.fm/sov',
                },
                lp: {
                  title: 'MES Liquidity',
                  tagline: 'Liquidity providing: the Main wallet\'s PancakeSwap position and rewards.',
                  homeHref: 'https://mes.fm/lp',
                },
                assets: {
                  title: 'MES Assets',
                  tagline: 'Every asset worth $10+ across Hive, EVM chains, Hyperliquid and XRP.',
                  homeHref: 'https://mes.fm/assets',
                },
                ai: {
                  title: 'MES AI Trading',
                  tagline: 'Read-only AI wallet tracker across BSC, Ethereum, Arbitrum, Polygon and Hyperliquid.',
                  homeHref: 'https://mes.fm/ai',
                  wallet: 'ai',
                },
                mfa: {
                  title: 'MikeFA Trading',
                  tagline: 'Read-only MikeFA wallet tracker on BSC.',
                  homeHref: 'https://mes.fm/mfa',
                  wallet: 'mfa',
                },
              }}
            />
            <main>{children}</main>
            <SiteFooter />
          </div>
        </SwrProvider>
        <Script src="https://mes.fm/main_js/track.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}

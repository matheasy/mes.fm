import type { Metadata } from 'next';
import Script from 'next/script';
import SiteChrome from '@/components/SiteChrome';
import SiteFooter from '@/components/SiteFooter';
import SwrProvider from '@/components/SwrProvider';
import ThemeScript from '@/components/ThemeScript';
import './globals.css';

const TITLE = 'MikeFA Trading';
const TAGLINE = 'Read-only MikeFA wallet tracker on BSC.';

export const metadata: Metadata = {
  title: TITLE,
  description: 'Read-only BSC wallet portfolio, transaction, and capital gains tracker',
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
            <SiteChrome title={TITLE} tagline={TAGLINE} homeHref="https://mes.fm/mfa" active="mfa" wallet="mfa" />
            <main>{children}</main>
            <SiteFooter />
          </div>
        </SwrProvider>
        <Script src="https://mes.fm/main_js/track.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}

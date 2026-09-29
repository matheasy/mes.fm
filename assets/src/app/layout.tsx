import type { Metadata } from 'next';
import SiteChrome from '@/components/SiteChrome';
import SiteFooter from '@/components/SiteFooter';
import SwrProvider from '@/components/SwrProvider';
import './globals.css';

const TITLE = 'MES Assets';
const TAGLINE = 'Every asset worth $10+ across Hive, EVM chains, Hyperliquid and XRP.';

export const metadata: Metadata = {
  title: TITLE,
  description: 'Every asset worth $10+ across Hive, Hive Engine, Magi, EVM chains, Hyperliquid and XRP - fetched once, shared with the other dashboards',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <SwrProvider>
          <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6">
            <SiteChrome title={TITLE} tagline={TAGLINE} />
            <main>{children}</main>
            <SiteFooter />
          </div>
        </SwrProvider>
      </body>
    </html>
  );
}

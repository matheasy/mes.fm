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
        {/* ad-slot-fill-and-collapse: requests a fill for the manual "MES Links Square" ad unit
            below, then hides its wrapper completely (no reserved blank box) if it never receives
            a real ad - whether that's because nothing filled or because an ad blocker kept the
            request from ever completing. Mirrors the same poll-for-an-iframe, hide-if-none-shows
            approach used on the rest of mes.fm. Runs once (next/script dedupes by id), since the
            App Router keeps this layout mounted across client-side navigation. */}
        <Script
          id="ad-slot-fill-and-collapse"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              document.querySelectorAll('.ad-slot ins.adsbygoogle').forEach(function () {
                (window.adsbygoogle = window.adsbygoogle || []).push({});
              });
              document.querySelectorAll('.ad-slot').forEach(function (slot) {
                var attempts = 0;
                var poll = setInterval(function () {
                  attempts++;
                  if (slot.querySelector('iframe')) {
                    clearInterval(poll);
                    return;
                  }
                  if (attempts >= 10) {
                    slot.style.setProperty('display', 'none', 'important');
                    clearInterval(poll);
                  }
                }, 200);
              });
            `,
          }}
        />
        <SwrProvider>
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            <div className="ad-slot mb-6 text-center">
              <ins
                className="adsbygoogle"
                style={{ display: 'block' }}
                data-ad-client="ca-pub-1461238060884369"
                data-ad-slot="1197859571"
                data-ad-format="auto"
                data-full-width-responsive="true"
              />
            </div>
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

'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import './SiteChrome.css';

/**
 * mes.fm's branded page chrome for the finance dashboards (assets / sov / ai / mfa / portfolio +
 * taxes): the same header, blue nav bar, floating compact bar, hamburger menu, search / A- / A+ /
 * theme buttons and "Part of" box as the static hub pages (mes.fm/crypto is the reference), plus one
 * row of tabs that links the dashboards to each other. Same file in all five apps - edit one, copy
 * it to the other four (SiteChrome.tsx, SiteChrome.css, SiteFooter.tsx, ThemeScript.tsx).
 *
 * Absolute mes.fm URLs throughout, never next/link: each app is mounted at its own basePath on a
 * separate Vercel deployment, so a relative href would get that basePath prepended instead of
 * leaving the app (see crypto/src/lib/wallets.ts for the same note).
 */

export type DashboardTab = 'portfolio' | 'assets' | 'transactions' | 'taxes' | 'ai' | 'mfa' | 'sov' | 'lp' | 'random-wallets';

interface SiteChromeProps {
  title: string;
  tagline: string;
  /** Where the brand title links: this dashboard's own home page */
  homeHref: string;
  /** The highlighted dashboard tab. Omitted on mes.fm/portfolio's own pages, where it follows the URL. */
  active?: DashboardTab;
  /** Inside one wallet's dashboard: the Transactions / Taxes tabs open pre-filtered to it */
  wallet?: 'ai' | 'mfa' | 'sov';
  /** An app serving several dashboards (crypto/: portfolio, taxes, sov) can title some tabs differently */
  pageTitles?: Partial<Record<DashboardTab, { title: string; tagline: string; homeHref: string; wallet?: 'ai' | 'mfa' }>>;
}

const CRYPTO_HUB = 'https://mes.fm/crypto';
const LOGO = 'https://mes.fm/img/crypto-logo.jpg';

/** The blue bar, as on mes.fm/crypto: the topic hub first and highlighted (like /math's "Math Tutorials") */
const NAV_LINKS = [
  { label: 'Calculators', href: 'https://mes.fm/calculators' },
  { label: 'Tools', href: 'https://mes.fm/tools' },
  { label: 'Mobile Apps', href: 'https://mes.fm/mobile-apps' },
  { label: 'Puzzles', href: 'https://mes.fm/puzzles' },
  { label: 'Memes', href: 'https://mes.fm/memes' },
];

/** The hamburger menu, as on mes.fm/crypto */
const MENU_LINKS = [
  { label: 'Home', href: 'https://mes.fm' },
  { label: 'MES Crypto', href: CRYPTO_HUB, active: true },
  { label: 'Math Tutorials', href: 'https://mes.fm/math' },
  { label: 'Calculators', href: 'https://mes.fm/calculators' },
  { label: 'Tools', href: 'https://mes.fm/tools' },
  { label: 'Puzzles', href: 'https://mes.fm/puzzles' },
  { label: 'Memes', href: 'https://mes.fm/memes' },
  { label: 'Store', href: 'https://teespring.com/stores/mes-store', external: true },
  { label: 'Subscribe', href: 'https://matheasy.substack.com/', external: true },
  { label: 'Donate', href: 'https://mes.fm/donate', external: true },
  { label: 'Contact Us', href: 'https://mes.fm/contact' },
];

/** Positions in main_img/social-sprites.png, same order as the static menu */
const SOCIAL = [
  { cls: 'hive', href: 'https://peakd.com/@mes', x: -16 },
  { cls: 'telegram', href: 'https://t.me/meslinks', x: -18 },
  { cls: 'fb', href: 'https://www.facebook.com/matheasysolutions', x: 0 },
  { cls: 'twitter', href: 'https://twitter.com/MathEasySolns', x: -8 },
  { cls: 'insta', href: 'https://instagram.com/matheasysolutions', x: -4 },
  { cls: 'pin', href: 'https://www.pinterest.com/matheasysolns', x: -6 },
  { cls: 'yt', href: 'https://www.youtube.com/user/MathEasySolutions', x: -10 },
  { cls: 'patreon', href: 'https://www.patreon.com/matheasysolutions', x: -12 },
];

function dashboardTabs(wallet?: string) {
  const q = wallet ? `?wallet=${wallet}` : '';
  return {
    combined: [
      { key: 'portfolio', label: 'Portfolio', href: 'https://mes.fm/portfolio' },
      { key: 'assets', label: 'Assets', href: 'https://mes.fm/assets' },
      { key: 'transactions', label: 'Transactions', href: `https://mes.fm/portfolio/transactions${q}` },
      { key: 'taxes', label: 'Taxes', href: `https://mes.fm/taxes${q}` },
    ],
    wallets: [
      { key: 'ai', label: 'AI Trading', href: 'https://mes.fm/ai' },
      { key: 'mfa', label: 'MikeFA Trading', href: 'https://mes.fm/mfa' },
      { key: 'sov', label: 'Store of Value', href: 'https://mes.fm/sov' },
      { key: 'lp', label: 'Liquidity', href: 'https://mes.fm/lp' },
      { key: 'random-wallets', label: 'Random Wallets', href: 'https://mes.fm/random-wallets' },
    ],
  };
}

/** Same steps + localStorage key as the static pages' A-/A+ (shared across mes.fm). Scales the root
 * font-size, which is what Tailwind's rem-based text-* sizes follow; ThemeScript applies a saved
 * value before first paint. */
const SCALE_STEPS = [87.5, 100, 112.5, 125, 137.5, 150];
const SCALE_KEY = 'articleFontScale';

function useTextScale() {
  const [index, setIndex] = useState(SCALE_STEPS.indexOf(100));

  useEffect(() => {
    let saved = NaN;
    try {
      saved = parseFloat(localStorage.getItem(SCALE_KEY) ?? '');
    } catch {
      // private browsing / blocked storage
    }
    const i = SCALE_STEPS.indexOf(saved);
    if (i !== -1) setIndex(i);
  }, []);

  function apply(next: number) {
    setIndex(next);
    document.documentElement.style.fontSize = `${SCALE_STEPS[next]}%`;
    try {
      localStorage.setItem(SCALE_KEY, String(SCALE_STEPS[next]));
    } catch {
      // ignore
    }
  }

  return {
    decrease: () => apply(Math.max(0, index - 1)),
    increase: () => apply(Math.min(SCALE_STEPS.length - 1, index + 1)),
    atMin: index === 0,
    atMax: index === SCALE_STEPS.length - 1,
  };
}

/** Dark unless `theme` is saved as 'light' - the static pages' rule and key, so one toggle covers all of mes.fm */
function useTheme() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains('light'));
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle('light', next);
    document.documentElement.classList.toggle('dark', !next);
    try {
      localStorage.setItem('theme', next ? 'light' : 'dark');
    } catch {
      // ignore
    }
  }

  return { light, toggle };
}

const SEARCH_ICON = (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
    <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.6" />
    <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

/** mes.fm's quick-search overlay (main_js/site-search.js, loaded below); falls back to the search page */
function openSearch() {
  const s = (window as unknown as { MESSearch?: { open?: () => void } }).MESSearch;
  if (s?.open) s.open();
  else window.location.href = 'https://mes.fm/search';
}

function activeFromPath(path: string): DashboardTab {
  for (const tab of ['sov', 'lp', 'random-wallets', 'ai', 'mfa', 'assets'] as const) {
    if (new RegExp(`(^|/)${tab}(/|$)`).test(path)) return tab;
  }
  if (path.includes('taxes')) return 'taxes';
  if (path.includes('transactions')) return 'transactions';
  return 'portfolio';
}

export default function SiteChrome(props: SiteChromeProps) {
  const { active, pageTitles } = props;
  const pathname = usePathname() ?? '';
  const current = active ?? activeFromPath(pathname);
  const page = pageTitles?.[current];
  const { title, tagline, homeHref } = page ?? props;
  const wallet = page ? page.wallet : props.wallet;
  const scale = useTextScale();
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [stuck, setStuck] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLUListElement>(null);

  // Floating bar: shown once the blue nav bar has scrolled off the top (same trigger and slide-in
  // as the static pages' #compact-nav script).
  useEffect(() => {
    let ticking = false;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let isStuck = false;
    function update() {
      ticking = false;
      const nav = navRef.current;
      if (!nav) return;
      const now = nav.getBoundingClientRect().bottom < 0;
      if (now === isStuck) return;
      isStuck = now;
      if (now) {
        clearTimeout(hideTimer);
        setVisible(true);
        requestAnimationFrame(() => requestAnimationFrame(() => setStuck(true)));
      } else {
        setStuck(false);
        hideTimer = setTimeout(() => setVisible(false), 220);
      }
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(hideTimer);
    };
  }, []);

  // Floating bar links that don't fit are dropped from the right, MES.fm (the last) kept longest.
  useEffect(() => {
    function fit() {
      const ul = linksRef.current;
      if (!ul || !visible) return;
      const items = Array.from(ul.children) as HTMLElement[];
      items.forEach((li) => (li.style.display = ''));
      for (const li of items.slice(0, -1).reverse()) {
        if (ul.scrollWidth <= ul.clientWidth) break;
        li.style.display = 'none';
      }
      const last = items[items.length - 1];
      if (last && ul.scrollWidth > ul.clientWidth) last.style.display = 'none';
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [visible]);

  const tabs = dashboardTabs(wallet);

  return (
    <div className={`mes-chrome${stuck ? ' is-stuck' : ''}`}>
      <div className={`mes-compact-nav${visible ? ' is-visible' : ''}`} aria-hidden={!stuck}>
        <a href={CRYPTO_HUB} tabIndex={stuck ? 0 : -1}>
          {/* eslint-disable-next-line @next/next/no-img-element -- external mes.fm asset */}
          <img className="mes-compact-logo" alt="" width={32} height={32} src={LOGO} />
        </a>
        <a className="mes-compact-title" href={homeHref} tabIndex={stuck ? 0 : -1}>
          {title}
        </a>
        <ul className="mes-compact-links" ref={linksRef}>
          <li>
            <a href={CRYPTO_HUB} tabIndex={stuck ? 0 : -1}>
              MES Crypto
            </a>
          </li>
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} tabIndex={stuck ? 0 : -1}>
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a href="https://mes.fm" tabIndex={stuck ? 0 : -1}>
              <b>MES.fm</b>
            </a>
          </li>
        </ul>
      </div>

      <div className="mes-top-bar">
        <div className="mes-brand">
          <a className="mes-brand-logo-link" href={CRYPTO_HUB}>
            {/* eslint-disable-next-line @next/next/no-img-element -- external mes.fm asset */}
            <img className="mes-brand-logo" src={LOGO} width={88} height={88} alt="MES Crypto logo" />
          </a>
          <div className="mes-brand-text">
            <a className="mes-brand-title" href={homeHref}>
              {title}
            </a>
            <p className="mes-brand-tag">{tagline}</p>
          </div>
        </div>
        <div className="mes-controls">
          <button type="button" className="mes-icon-btn" onClick={openSearch} aria-label="Search mes.fm" title="Search mes.fm (/)">
            {SEARCH_ICON}
          </button>
          <button
            type="button"
            className="mes-icon-btn"
            onClick={scale.decrease}
            disabled={scale.atMin}
            aria-label="Decrease text size"
            title="Decrease text size"
          >
            A&minus;
          </button>
          <button
            type="button"
            className="mes-icon-btn"
            onClick={scale.increase}
            disabled={scale.atMax}
            aria-label="Increase text size"
            title="Increase text size"
          >
            A+
          </button>
          <button
            type="button"
            className="mes-icon-btn"
            onClick={theme.toggle}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {theme.light ? '🌙' : '☀️'}
          </button>
        </div>
        <button
          type="button"
          className="mes-hamburger"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Site navigation"
          aria-haspopup="true"
          aria-expanded={menuOpen}
        />
        {menuOpen && (
          <>
            <button type="button" aria-label="Close menu" className="mes-menu-backdrop" onClick={() => setMenuOpen(false)} />
            <ul className="mes-menu" role="navigation" aria-label="Site menu">
              {MENU_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    className={`mes-menu-link${l.active ? ' mes-active-tab' : ''}`}
                    href={l.href}
                    {...(l.external ? { target: '_blank', rel: 'noopener' } : {})}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li className="mes-menu-social">
                <div className="mes-social-container">
                  <p className="mes-social-text">Follow us!</p>
                  <ul className="mes-social">
                    {SOCIAL.map((s) => (
                      <li key={s.cls}>
                        <a
                          className="mes-social-link"
                          href={s.href}
                          target="_blank"
                          rel="noopener"
                          aria-label={s.cls}
                          style={{ backgroundPosition: `${s.x}em 0` }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            </ul>
          </>
        )}
      </div>

      <div className="mes-info-bar-container" role="navigation" aria-label="Primary" ref={navRef}>
        <ul className="mes-info-bar">
          <li>
            <a className="mes-info-bar-link mes-active-tab" href={CRYPTO_HUB}>
              MES Crypto
            </a>
          </li>
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a className="mes-info-bar-link" href={l.href}>
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a className="mes-info-bar-link" href="https://mes.fm" style={{ fontWeight: 'bold' }}>
              MES.fm
            </a>
          </li>
        </ul>
      </div>

      <div className="mes-part-of">
        Part of <a href={CRYPTO_HUB}>MES Crypto</a>
      </div>

      <ul className="mes-tabs" aria-label="Dashboards">
        {tabs.combined.map((t) => (
          <li key={t.key}>
            <a className={`mes-tab${current === t.key ? ' is-active' : ''}`} href={t.href} aria-current={current === t.key ? 'page' : undefined}>
              {t.label}
            </a>
          </li>
        ))}
        <li className="mes-tab-sep" aria-hidden="true" />
        {tabs.wallets.map((t) => (
          <li key={t.key}>
            <a className={`mes-tab${current === t.key ? ' is-active' : ''}`} href={t.href} aria-current={current === t.key ? 'page' : undefined}>
              {t.label}
            </a>
          </li>
        ))}
      </ul>

      {/* the static pages' quick-search overlay + "/" and Ctrl/Cmd+K shortcuts; it only attaches its own
          button to a .header-controls element, which this header deliberately doesn't have */}
      <Script src="https://mes.fm/main_js/site-search.js?v=2" strategy="afterInteractive" />
    </div>
  );
}

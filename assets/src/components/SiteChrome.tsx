'use client';

import { useEffect, useState } from 'react';

interface SiteChromeProps {
  title: string;
  tagline: string;
  /** The "Part of ..." box below the nav bar - defaults to this dashboard family's own hub. */
  partOfLabel?: string;
  partOfHref?: string;
}

/** The rest of mes.fm's info-bar nav, minus Home/Subscribe/Store/Donate/Contact Us - those are
 * hidden on every generated hub page too (see mes.fm/crypto's index.html), so this matches. */
const NAV_LINKS = [
  { label: 'Math Tutorials', href: 'https://mes.fm/math' },
  { label: 'Calculators', href: 'https://mes.fm/calculators' },
  { label: 'Tools', href: 'https://mes.fm/tools' },
  { label: 'Mobile Apps', href: 'https://mes.fm/mobile-apps' },
  { label: 'Puzzles', href: 'https://mes.fm/puzzles' },
  { label: 'Memes', href: 'https://mes.fm/memes' },
];

/** The items the inline blue bar hides on every generated hub page (info-bar__item--utility) -
 * these live behind the hamburger instead, same as the static site. */
const MENU_EXTRA_LINKS = [
  { label: 'Home', href: 'https://mes.fm' },
  { label: 'Store', href: 'https://teespring.com/stores/mes-store' },
  { label: 'Subscribe', href: 'https://matheasy.substack.com/' },
  { label: 'Donate', href: 'https://mes.fm/donate' },
  { label: 'Contact Us', href: 'https://mes.fm/contact' },
];

/** Same steps/localStorage key as the static site's A-/A+ control (main_js/display-controls.js),
 * so the preference is shared across mes.fm even though this is a separate app. Scales the real
 * root font-size (not a wrapping div's), so it actually resizes Tailwind's rem-based text-* utilities. */
const SCALE_STEPS = [87.5, 100, 112.5, 125, 137.5, 150];
const SCALE_KEY = 'articleFontScale';

function useTextScale() {
  const [index, setIndex] = useState(SCALE_STEPS.indexOf(100));

  useEffect(() => {
    let saved: number | null = null;
    try {
      saved = Number(localStorage.getItem(SCALE_KEY));
    } catch {
      // ignore - private browsing / blocked storage
    }
    const i = SCALE_STEPS.indexOf(saved ?? 100);
    if (i !== -1) {
      setIndex(i);
      document.documentElement.style.fontSize = `${SCALE_STEPS[i]}%`;
    }
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

function HeaderControls({
  scale,
  iconClass,
  menu,
}: {
  scale: ReturnType<typeof useTextScale>;
  iconClass: string;
  /** Omit on the floating bar - the static site's own compact bar has no hamburger either */
  menu?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative flex shrink-0 items-center gap-1.5">
      <a href="https://mes.fm/search" aria-label="Search mes.fm" title="Search mes.fm" className={iconClass}>
        🔍
      </a>
      <button
        type="button"
        onClick={scale.decrease}
        disabled={scale.atMin}
        aria-label="Decrease text size"
        title="Decrease text size"
        className={`${iconClass} disabled:opacity-40`}
      >
        A&minus;
      </button>
      <button
        type="button"
        onClick={scale.increase}
        disabled={scale.atMax}
        aria-label="Increase text size"
        title="Increase text size"
        className={`${iconClass} disabled:opacity-40`}
      >
        A+
      </button>
      {menu && (
        <>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Site menu"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            className={iconClass}
          >
            ☰
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                {MENU_EXTRA_LINKS.map((l) => (
                  <a key={l.href} href={l.href} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                    {l.label}
                  </a>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The same branded header + blue nav bar + "Part of" box every mes.fm hub page carries (see
 * mes.fm/crypto's static index.html) - ported to Tailwind so this dashboard reads as part of the
 * site rather than a bare internal tool. Also carries that page's search icon, A-/A+ text-size
 * control, and hamburger menu (Home/Store/Subscribe/Donate/Contact Us - the items the inline bar
 * hides on every generated hub page too), plus a floating mini header that appears once you scroll
 * past the full one (no hamburger there, matching the static site's own compact bar).
 *
 * Deliberately NOT included: a dark-mode toggle. The static site's moon button switches a real
 * light theme; these dashboards have no light theme at all (they're built dark-only), so a toggle
 * here would have nothing to switch to. Worth a proper light theme as separate, dedicated work if
 * wanted - not a cosmetic button that does nothing.
 *
 * Absolute mes.fm URLs throughout, never next/link: this app is mounted at its own basePath on a
 * separate Vercel deployment, so a relative href would get that basePath prepended instead of
 * leaving the app (see crypto/src/lib/wallets.ts for the same note).
 */
export default function SiteChrome({ title, tagline, partOfLabel = 'MES Portfolio', partOfHref = 'https://mes.fm/portfolio' }: SiteChromeProps) {
  const scale = useTextScale();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    function onScroll() {
      setStuck(window.scrollY > 140);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const iconClass =
    'flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white text-sm text-gray-700 hover:border-accent hover:text-accent';
  const floatingIconClass =
    'flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-white/10 text-xs text-white hover:bg-white/20';

  return (
    <>
      {stuck && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center gap-3 bg-[#131722]/95 px-4 py-2 shadow-lg backdrop-blur sm:px-6">
          <a href="https://mes.fm/crypto" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- external mes.fm asset */}
            <img src="https://mes.fm/img/crypto-logo.jpg" alt="MES Crypto" width={28} height={28} className="rounded" />
          </a>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-100">{title}</span>
          <HeaderControls scale={scale} iconClass={floatingIconClass} />
        </div>
      )}

      <div className="mb-6 overflow-hidden rounded-xl border border-bg-border">
        <div className="flex items-center gap-4 bg-gray-100 px-4 py-4 sm:px-6">
          <a href="https://mes.fm/crypto" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- external mes.fm asset, not part of this app's own build */}
            <img src="https://mes.fm/img/crypto-logo.jpg" alt="MES Crypto" width={56} height={56} className="rounded-md" />
          </a>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-gray-900">{title}</h1>
            <p className="truncate text-sm text-gray-600">{tagline}</p>
          </div>
          <HeaderControls scale={scale} iconClass={iconClass} menu />
        </div>
        <nav aria-label="MES.fm" className="flex flex-wrap justify-center bg-[#277bb6] sm:justify-start">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="px-4 py-2.5 text-sm text-white hover:bg-[#346689]">
              {l.label}
            </a>
          ))}
          <a href="https://mes.fm" className="px-4 py-2.5 text-sm font-bold text-white hover:bg-[#346689]">
            MES.fm
          </a>
        </nav>
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700 sm:px-6">
          Part of{' '}
          <a href={partOfHref} className="font-semibold text-[#277bb6] hover:underline">
            {partOfLabel}
          </a>
        </div>
      </div>
    </>
  );
}

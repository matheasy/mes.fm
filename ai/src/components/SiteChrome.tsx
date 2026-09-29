interface SiteChromeProps {
  title: string;
  tagline: string;
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

/**
 * The same branded header + blue nav bar + "Part of" box every mes.fm hub page carries (see
 * mes.fm/crypto's static index.html) - ported to Tailwind so this dashboard reads as part of the
 * site rather than a bare internal tool.
 *
 * Absolute mes.fm URLs throughout, never next/link: this app is mounted at its own basePath on a
 * separate Vercel deployment, so a relative href would get that basePath prepended instead of
 * leaving the app (see crypto/src/lib/wallets.ts for the same note).
 */
export default function SiteChrome({ title, tagline }: SiteChromeProps) {
  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-bg-border">
      <div className="flex items-center gap-4 bg-gray-100 px-4 py-4 sm:px-6">
        <a href="https://mes.fm" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- external mes.fm asset, not part of this app's own build */}
          <img src="https://mes.fm/img/logo-mark.png" alt="MES.fm" width={56} height={56} className="rounded-md" />
        </a>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-gray-900">{title}</h1>
          <p className="truncate text-sm text-gray-600">{tagline}</p>
        </div>
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
        <a href="https://mes.fm/portfolio" className="font-semibold text-[#277bb6] hover:underline">
          MES Portfolio
        </a>
      </div>
    </div>
  );
}

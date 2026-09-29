/** Replaces Next's built-in 404 (its own black full-screen styling sat oddly inside the site chrome).
 * Same file in all five dashboards (assets/sov/ai/mfa/crypto); absolute links, see SiteChrome.tsx. */
export default function NotFound() {
  const links = [
    { label: 'Portfolio', href: 'https://mes.fm/portfolio' },
    { label: 'Assets', href: 'https://mes.fm/assets' },
    { label: 'Transactions', href: 'https://mes.fm/portfolio/transactions' },
    { label: 'Taxes', href: 'https://mes.fm/taxes' },
    { label: 'MES Crypto', href: 'https://mes.fm/crypto' },
  ];

  return (
    <div className="panel flex flex-col items-center gap-4 py-12 text-center">
      <p className="text-4xl font-semibold text-gray-100">404</p>
      <p className="text-gray-400">This page doesn&apos;t exist. Try one of these instead:</p>
      <div className="flex flex-wrap justify-center gap-2">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent"
          >
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}

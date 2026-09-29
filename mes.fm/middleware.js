// Vercel Edge Middleware — light HTTP Basic Auth gate for the private finance dashboards:
// /portfolio, /taxes, /sov, /lp, /assets - and the same pages reached under /finance/..., the one app's
// own path (Vercel project mes-fm-crypto, basePath /finance, rewritten in vercel.json). mes.fm/ai and
// mes.fm/mfa are sections of the same app but public by design, so /finance/ai/*, /finance/mfa/* and
// the app's /finance/_next/* assets are let through. (mes.fm/crypto is the unrelated static MES Crypto
// hub page and isn't matched at all.)
//
// Middleware runs before vercel.json rewrites, so this challenges for a password first and only
// lets the proxy through on success. One shared realm + username/password, so unlocking one
// unlocks the others. Browsers resend the credentials for the whole site once given, which is how
// a gated page's own requests to /finance/api/... get through.
//
// This is only meant to keep the pages out of the hands of the general public /
// search crawlers — it is not a hardened secret. Username must be "mes", password "911".

export const config = {
  matcher: [
    '/portfolio',
    '/portfolio/:path*',
    '/taxes',
    '/taxes/:path*',
    '/sov',
    '/sov/:path*',
    '/lp',
    '/lp/:path*',
    '/assets',
    '/assets/:path*',
    '/finance/:path+',
    '/ai/:path*',
  ],
};

/** Public parts of the app behind /finance/...: the AI Trading and MikeFA pages + their data, and its static files */
const PUBLIC_FINANCE = /^\/finance\/(ai|mfa|_next)(\/|$)/;
/** ...except the Main wallet, which the AI Trading section also serves (?wallet=main) for the private
 * dashboards. The app's own server-side calls go to mes-fm-crypto.vercel.app directly, not through here. */
function isPublic(url) {
  if (url.searchParams.get('wallet') === 'main') return false;
  return PUBLIC_FINANCE.test(url.pathname) || /^\/ai(\/|$)/.test(url.pathname);
}

const USERNAME = 'mes';
const PASSWORD = '911';
const REALM = 'mes.fm';

export default function middleware(request) {
  if (isPublic(new URL(request.url))) return;

  const header = request.headers.get('authorization') || '';

  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(':');
      const username = decoded.slice(0, sep);
      const password = decoded.slice(sep + 1);
      if (username === USERNAME && password === PASSWORD) {
        return; // authorized — continue to the rewrite
      }
    } catch {
      // malformed header — fall through to the challenge
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
    },
  });
}

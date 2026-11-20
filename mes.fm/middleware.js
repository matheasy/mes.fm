// Vercel Edge Middleware — light HTTP Basic Auth gate for the private finance dashboards:
// /portfolio, /taxes, /sov, /lp, /assets, /random-wallets, /cash, /tokens, /strategy, /ads (+ its data /api/earnings), /search-console (+ /api/search-console, /api/search-console-ai) - and the same pages reached under /finance/..., the one app's
// own path (Vercel project mes-fm-crypto, basePath /finance, rewritten in vercel.json). mes.fm/ai-trading (the AI Trading wallet;
// mes.fm/ai is the unrelated public MES AI chat page) and mes.fm/mfa are sections of the same app but public by design, so /finance/ai/*, /finance/mfa/* and
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
    '/random-wallets',
    '/cash',
    '/tokens',
    '/strategy',
    '/assets',
    '/assets/:path*',
    '/finance/:path+',
    '/ai-trading',
    '/ai-trading/:path*',
    // the private ads money page (AdSense earnings vs Google Ads spend) and its data
    '/ads',
    '/ads/:path*',
    '/api/earnings',
    // the private Search Console dashboard (Google Search Console + Bing Webmaster numbers) and its data
    '/search-console',
    '/search-console/:path*',
    '/api/search-console',
    // its imported AI-search numbers (Google AI features / Bing AI Performance exports dropped on the page)
    '/api/search-console-ai',
    // chart notes shared by the /search-console and /ads charts
    '/api/chart-notes',
    // the private creator dashboard (stats, comments and notifications of @mes and @mestruth on every video platform) and its data
    '/dashboard',
    '/dashboard/:path*',
    '/api/dashboard',
    // the private MES Polls usage page (polls made, votes, question types, moderation queue) and its data
    '/polls-stats',
    '/polls-stats/:path*',
    '/api/polls-admin',
    // the private list of fixes and new-app ideas (replaces two Telegram groups) and its data
    '/edits',
    '/edits/:path*',
    '/api/edits',
    // Karo's dashboard for alpinewestcreative.com (stats, Search Console, SEO): pages at /awc/..., data at /api/awc/...
    // (her domain proxies /stats, /search-console, /seo there). Own login: karo / rome (mes / 911 works too).
    '/awc',
    '/awc/:path*',
    '/api/awc/:path*',
  ],
};

/** Public parts of the app behind /finance/...: the AI Trading and MikeFA pages + their data, and its static files */
const PUBLIC_FINANCE = /^\/finance\/(ai|mfa|_next)(\/|$)/;
/** ...except the Main wallet, which the AI Trading section also serves (?wallet=main) for the private
 * dashboards. The app's own server-side calls go to mes-fm-crypto.vercel.app directly, not through here. */
function isPublic(url) {
  if (url.searchParams.get('wallet') === 'main') return false;
  return PUBLIC_FINANCE.test(url.pathname) || /^\/ai-trading(\/|$)/.test(url.pathname);
}

const USERNAME = 'mes';
const PASSWORD = '911';
const REALM = 'mes.fm';

// Karo's own login for the alpinewestcreative.com dashboard (api/_site.js); her Search Console numbers arrive from
// an Apps Script with its own key, so that one URL is not behind the login.
const AWC = /^\/(awc|api\/awc)(\/|$)/;
const AWC_OPEN = /^\/api\/awc\/(search-console-ingest|p)\/?$/;  // the Apps Script ingest (has its key) and her page-view beacon
const AWC_USERS = [['karo', 'rome'], [USERNAME, PASSWORD]];

export default function middleware(request) {
  const url = new URL(request.url);
  if (isPublic(url)) return;
  const awc = AWC.test(url.pathname);
  if (awc && AWC_OPEN.test(url.pathname)) return;

  const header = request.headers.get('authorization') || '';

  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(':');
      const username = decoded.slice(0, sep);
      const password = decoded.slice(sep + 1);
      if (awc ? AWC_USERS.some(([u, p]) => u === username && p === password) : (username === USERNAME && password === PASSWORD)) {
        return; // authorized — continue to the rewrite
      }
    } catch {
      // malformed header — fall through to the challenge
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${awc ? 'Alpine West Creative' : REALM}", charset="UTF-8"`,
    },
  });
}

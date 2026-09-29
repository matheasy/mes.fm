// Vercel Edge Middleware — light HTTP Basic Auth gate for /portfolio, /sov and /assets.
//
// Both paths are proxy rewrites (see vercel.json) to external tracker apps
// (mes-fm-crypto, mes-fm-sov, mes-fm-assets). Middleware runs before vercel.json rewrites, so
// this challenges for a password first and only lets the proxy through on
// success. One shared realm + username/password, so unlocking one unlocks the other.
//
// This is only meant to keep the pages out of the hands of the general public /
// search crawlers — it is not a hardened secret. Username must be "mes", password "911".

export const config = {
  matcher: ['/portfolio', '/portfolio/:path*', '/sov', '/sov/:path*', '/assets', '/assets/:path*'],
};

const USERNAME = 'mes';
const PASSWORD = '911';
const REALM = 'mes.fm';

export default function middleware(request) {
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

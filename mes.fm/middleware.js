// Vercel Edge Middleware — light HTTP Basic Auth gate for /portfolio and /sov.
//
// Both paths are proxy rewrites (see vercel.json) to external tracker apps
// (mes-fm-crypto, mes-fm-sov). Middleware runs before vercel.json rewrites, so
// this challenges for a password first and only lets the proxy through on
// success. One shared realm + password, so unlocking one unlocks the other.
//
// This is only meant to keep the pages out of the hands of the general public /
// search crawlers — it is not a hardened secret. Any username is accepted; the
// password must be "mes911".

export const config = {
  matcher: ['/portfolio', '/portfolio/:path*', '/sov', '/sov/:path*'],
};

const PASSWORD = 'mes911';
const REALM = 'mes.fm';

export default function middleware(request) {
  const header = request.headers.get('authorization') || '';

  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const password = decoded.slice(decoded.indexOf(':') + 1);
      if (password === PASSWORD) {
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

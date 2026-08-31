// Vercel Edge Middleware — HTTP Basic Auth gate for /portfolio.
//
// mes.fm/portfolio is a proxy rewrite (see vercel.json) to the external
// mes-fm-crypto app. Middleware runs before vercel.json rewrites, so this
// challenges for a password first and only lets the proxy through on success.
//
// Any username is accepted; the password must be "mes911".

export const config = {
  matcher: ['/portfolio', '/portfolio/:path*'],
};

const PASSWORD = 'mes911';
const REALM = 'mes.fm/portfolio';

export default function middleware(request) {
  const header = request.headers.get('authorization') || '';

  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const password = decoded.slice(decoded.indexOf(':') + 1);
      if (password === PASSWORD) {
        return; // authorized — continue to the /portfolio rewrite
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

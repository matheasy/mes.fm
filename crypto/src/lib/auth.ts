/**
 * The finance pages sit behind mes.fm's Basic Auth (mes.fm/middleware.js), which forwards the browser's
 * Authorization header to this app. Actions that change or export stored records check it again here,
 * because this app's own address (mes-fm-crypto.vercel.app) is reachable without going through mes.fm.
 * Same weak shared password as the middleware - it keeps the public out, it is not a hardened secret.
 */
const EXPECTED = `Basic ${Buffer.from('mes:911').toString('base64')}`;

export function isOwner(request: Request): boolean {
  return request.headers.get('authorization') === EXPECTED;
}

/** Vercel's cron requests carry `Authorization: Bearer <CRON_SECRET>` when that variable is set */
export function isCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return true;
  return (request.headers.get('user-agent') ?? '').startsWith('vercel-cron/');
}

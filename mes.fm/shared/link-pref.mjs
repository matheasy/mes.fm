// "Open in:" preferred-site switch for the Grid View / List View hub pages (mes.fm/livestreams, mes.fm/math-qa, ...).
//
// Build side (this file): every card / List View title link that can go to more than one site is an `<a class="lp-a">`
// carrying `data-lp-def="<site>"` (where it goes by default = the page's old behaviour) and one `data-l-<site>="<url>"`
// per site the item has a link on (the default site included). Its "View" caption holds a small site icon
// (`.lp-ic[data-s]`, drawn with a CSS mask so it takes the text colour in light and dark mode) and the site name
// (`.lp-name`). lpSwitch() renders the row of site buttons (with how many items have each site); LP_CSS is inlined
// into the page; the client script `main_js/link-pref.js` (LP_SCRIPT) points every lp-a at the chosen site where the
// item has it (else its default), updates the icon / caption, and saves the choice as localStorage `mes-linkpref`
// (shared by every page with the switch; a page that does not offer the saved site shows Auto).
//
// To add the switch to another build.mjs: collect each item's links ([label, href] pairs or {label, href}) and call
// lpMap(links) -> lpAttrs(map, defaultHref) on the anchor, lpCaption(site) in the card, lpSwitch(maps) above the
// views, ${LP_CSS} in the <style>, ${LP_SCRIPT} before </body>.

const svg = (d) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill-rule='evenodd' d='${d}'/></svg>`)}")`;

// Site order = button order. Icons are simple 24x24 single-colour marks (filled by currentColor through a mask).
export const LP_SITES = [
  { id: "mes", label: "MES.fm", host: /^https?:\/\/(?:www\.)?mes\.fm\//, d: "M1 12.6 4.6 10.6 8.6 17.4 14.6 1.8H23.2V4.8H16.6L10 22.4H7.4z" },
  {
    id: "youtube", label: "YouTube", host: /^https?:\/\/(?:(?:www|m)\.)?(?:youtube\.com\/(?:watch|live|shorts)|youtu\.be\/)/,
    d: "M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2C.5 9.1.5 12 .5 12s0 2.9.5 4.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-4.8.5-4.8s0-2.9-.5-4.8zM9.7 15.4V8.6l5.9 3.4z",
  },
  { id: "hive", label: "Hive", host: /^https?:\/\/(?:www\.)?(?:peakd\.com|hive\.blog|ecency\.com|inleo\.io)\//, d: "M6.8 2.5h10.4L22.5 12l-5.3 9.5H6.8L1.5 12zM9 6.5 6.3 12 9 17.5h6l2.7-5.5L15 6.5z" },
  { id: "3speak", label: "3Speak", host: /^https?:\/\/(?:www\.)?3speak\.(?:tv|co|online)\//, d: "M12 1.5a10.5 10.5 0 1 1 0 21 10.5 10.5 0 0 1 0-21zM9.5 7.5v9l7-4.5z" },
  { id: "rumble", label: "Rumble", host: /^https?:\/\/(?:www\.)?rumble\.com\//, d: "M5 3.8c0-1.6 1.7-2.5 3-1.6l12.4 8.2c1.2.8 1.2 2.4 0 3.2L8 21.8c-1.3.9-3-.1-3-1.6zM8.6 8.5v7l5.4-3.5z" },
  { id: "odysee", label: "Odysee", host: /^https?:\/\/(?:www\.)?odysee\.com\//, d: "M12 1.5a10.5 10.5 0 1 1 0 21 10.5 10.5 0 0 1 0-21zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" },
  { id: "x", label: "X", host: /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//, d: "M3 3h5.4l4.2 5.9L17.7 3h3l-6.7 7.7L21.5 21h-5.4l-4.6-6.4L5.9 21H3l7.2-8.3z" },
  { id: "bitchute", label: "BitChute", host: /^https?:\/\/(?:www\.)?bitchute\.com\//, d: "M3 3h18v18H3zM8 6.5v11h5.3c2.2 0 3.7-1.2 3.7-3.1 0-1.4-.8-2.4-2.1-2.7 1-.4 1.6-1.3 1.6-2.4 0-1.8-1.4-2.8-3.5-2.8zM10.6 8.6h2.1c.9 0 1.4.4 1.4 1.1s-.5 1.2-1.4 1.2h-2.1zm0 4.2h2.4c1 0 1.5.5 1.5 1.2 0 .8-.6 1.3-1.5 1.3h-2.4z" },
  { id: "telegram", label: "Telegram", host: /^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//, d: "M1.5 11.2 21.6 3.3c.9-.3 1.7.3 1.4 1.7l-3.4 16c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6.9 14.6 2 13.1c-1.1-.3-1.1-1.1.5-1.9z" },
  { id: "twitch", label: "Twitch", host: /^https?:\/\/(?:www\.)?twitch\.tv\//, d: "M4 2 2.5 6v14h5v2.5h2.8L13 20h4l5-5V2zm16 12-3 3h-4.5L10 19.5V17H6V4h14zM15 7h2v5h-2zm-5 0h2v5h-2z" },
];
const BY_ID = Object.fromEntries(LP_SITES.map((s) => [s.id, s]));

// Labels of links that are not the item itself (a trailer, a summary post, a playlist, notes PDFs): never a target.
const NOT_THE_ITEM = /^(?:trailer|summary|playlist|pdf|mes links)/i;

export function lpSite(href) {
  const s = LP_SITES.find((x) => x.host.test(href || ""));
  return s ? s.id : null;
}

// links: [[label, href], ...] or [{label, href}, ...] -> { site: firstHref } (first link per site wins).
export function lpMap(links) {
  const map = {};
  for (const l of links || []) {
    const [label, href] = Array.isArray(l) ? l : [l.label, l.href];
    if (NOT_THE_ITEM.test(label || "")) continue;
    const s = lpSite(href);
    if (s && !map[s]) map[s] = href;
  }
  return map;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Attributes for the anchor. defHref = where it goes today; returns "" (no switching) for a link on an unknown site.
export function lpAttrs(map, defHref) {
  const def = lpSite(defHref);
  if (!def) return "";
  const all = { ...map, [def]: map[def] || defHref };
  return ` data-lp-def="${def}"` + LP_SITES.filter((s) => all[s.id]).map((s) => ` data-l-${s.id}="${esc(all[s.id])}"`).join("");
}

export const lpIcon = (site) => `<span class="lp-ic" data-s="${site}" aria-hidden="true"></span>`;

// The card caption: "<icon> View on YouTube ->" (site = the default site of the card).
export function lpCaption(defHref, fallback = "View &rarr;") {
  const s = lpSite(defHref);
  if (!s) return fallback;
  return `${lpIcon(s)}<span class="lp-name">View on ${BY_ID[s].label}</span> &rarr;`;
}

// The switch. maps = one lpMap() per item of the main list (for the counts); a site is offered when at least
// `min` items have it (default: half the items, at most 8; the sites in `keep`: as soon as one item has it), and drawn
// faint (dashed, still usable) when fewer than `few` (fraction) of the items have it. min 8 keeps out e.g. the
// livestreams' Twitch links (channel links, 5 streams).
export function lpSwitch(maps, { min, few = 0.25, keep = ["mes", "youtube", "hive"] } = {}) {
  const n = maps.length;
  if (min === undefined) min = Math.min(8, Math.max(2, Math.ceil(n / 2)));
  const sites = LP_SITES.map((s) => ({ ...s, count: maps.filter((m) => m[s.id]).length })).filter(
    (s) => s.count >= min || (s.count > 0 && keep.includes(s.id))
  );
  if (sites.length < 2) return "";
  const btns = sites
    .map((s) => {
      const what = `${s.label} (${s.count} of ${n} have a ${s.label} link)`;
      return `<button type="button" data-s="${s.id}" data-label="${esc(s.label)}" aria-pressed="false" aria-label="Open in ${esc(what)}" title="Open in ${esc(what)}"${s.count < few * n ? ' class="lp-few"' : ""}>${lpIcon(s.id)}<span class="lp-n">${s.count}</span></button>`;
    })
    .join("");
  return `<div class="lp" data-lp role="group" aria-label="Open links in">
        <span class="lp-lbl" aria-hidden="true">Open in:</span><button type="button" data-s="auto" aria-pressed="true" aria-label="Open in: Auto (the usual link: the mes.fm page when there is one)" title="Auto: the usual link (the mes.fm page when there is one)">Auto</button>${btns}
      </div>`;
}

// Should a section get the switch? Yes when at least `share` of its items have links on two or more sites and the
// switch would offer at least two sites (so the posts-only sections of the hubs stay as they were).
export function lpWanted(maps, share = 0.4) {
  const multi = maps.filter((m) => Object.keys(m).length >= 2).length;
  return maps.length > 0 && multi >= share * maps.length && lpSwitch(maps) !== "";
}

// The switch on its own line (a section without the search box / chips).
export const lpSolo = (html) => (html ? `<div class="lp-row lp-row--solo">${html}</div>` : "");

const icons = LP_SITES.map((s) => `.lp-ic[data-s="${s.id}"] { --lp-i: ${svg(s.d)}; }`).join("\n");

export const LP_CSS = `/* "Open in:" preferred-site switch + per-card site icon (shared/link-pref.mjs, main_js/link-pref.js). */
.lp-row { display: flex; flex-wrap: wrap; align-items: flex-start; column-gap: 1em; }
.lp-row > .ls-chips { flex: 1 1 22em; }
.lp-row--solo { margin: 0 0 0.6em; }
.lp { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3em; margin: 0.7em 0 0 auto; font-size: 0.85em; }
.lp-lbl { color: #555; margin-right: 0.15em; }
.lp button {
  font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3em; min-height: 2.2em;
  padding: 0.3em 0.65em; border-radius: 1.2em; border: 1px solid #c3c9d2; background: #fff; color: #333;
}
.lp button:hover { border-color: #277bb6; color: #1a6fb0; }
.lp button:focus-visible { outline: 2px solid #277bb6; outline-offset: 2px; }
.lp button[aria-pressed="true"] { background: #277bb6; border-color: #277bb6; color: #fff; }
.lp button.lp-few:not([aria-pressed="true"]) { color: #6a7280; border-style: dashed; }
.lp-n { font-size: 0.85em; font-variant-numeric: tabular-nums; }
.lp-ic {
  display: inline-block; flex: none; width: 1.15em; height: 1.15em; vertical-align: -0.2em; background: currentColor;
  -webkit-mask: var(--lp-i) center / contain no-repeat; mask: var(--lp-i) center / contain no-repeat;
}
/* the pages' CSS reset paints every span / a #333: take the button's / caption's colour instead */
.lp button span, .lp-a .lp-ic, .lp-a .lp-name { color: inherit; }
.link-card-readmore .lp-ic { margin-right: 0.3em; }
.list-row h3 .lp-a { color: inherit; text-decoration: none; }
.list-row h3 .lp-a:hover { text-decoration: underline; }
.list-row h3 .lp-ic { width: 0.85em; height: 0.85em; margin-left: 0.35em; vertical-align: -0.05em; opacity: 0.75; }
${icons}
body.dark-mode .lp-lbl, body.dark .lp-lbl { color: #bbb; }
body.dark-mode .list-row h3 .lp-a, body.dark .list-row h3 .lp-a { color: inherit; }
body.dark-mode .lp button, body.dark .lp button { background: #2a2a2a; color: #ddd; border-color: #555; }
body.dark-mode .lp button:hover, body.dark .lp button:hover { border-color: #6cb6f5; color: #6cb6f5; }
body.dark-mode .lp button[aria-pressed="true"], body.dark .lp button[aria-pressed="true"] { background: #6cb6f5; border-color: #6cb6f5; color: #111; }
body.dark-mode .lp button.lp-few:not([aria-pressed="true"]), body.dark .lp button.lp-few:not([aria-pressed="true"]) { color: #a3abb8; }
body.dark-mode .lp button:focus-visible, body.dark .lp button:focus-visible { outline-color: #6cb6f5; }
`;

export const LP_SCRIPT = `<script src="/main_js/link-pref.js?v=1" defer></script>`;

// Build-side half of the runtime top-up (main_js/list-topup.js): turns a page's category table into the regex spec the browser uses, checks that
// the browser would classify the snapshot exactly as the build did, and emits the config + script tags. Used by ama/build.mjs and math/build.mjs.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export const TOPUP = require("../main_js/list-topup.js");
export const TOPUP_V = 1; // bump with list-topup.js changes

// { id, test: (t) => /re/flags.test(t), tags } -> { id, re, fl, tags }. The test must be a single regex literal on the title (fails the build otherwise).
export function catSpec(cats) {
  return cats.map((c) => {
    const m = /^\(t\)\s*=>\s*\/(.+)\/([a-z]*)\.test\(t\)$/s.exec(String(c.test).trim());
    if (!m) throw new Error(`list-topup: category ${c.id} is not a single /regex/.test(t)`);
    new RegExp(m[1], m[2]); // throws on a source the browser could not read either
    return { id: c.id, re: m[1], fl: m[2], ...(c.tags ? { tags: c.tags } : {}) };
  });
}

// items: [{ title, tags?, cats }] as the build classified them. Throws on the first item the client would put elsewhere.
export function checkCats(items, spec) {
  const cats = TOPUP.compileCats(spec);
  for (const it of items) {
    const got = TOPUP.catsFor({ title: it.title, tags: it.tags || [] }, cats);
    if (got !== it.cats) throw new Error(`list-topup: "${it.title}" is "${it.cats}" in the build but "${got}" in the browser`);
  }
}

export function topupScripts(cfg) {
  const json = JSON.stringify(cfg).replace(/</g, "\\u003c");
  return `<script>(window.MES_TOPUP = window.MES_TOPUP || []).push(${json});</script>
<script src="/main_js/list-topup.js?v=${TOPUP_V}" defer></script>`;
}

// Refreshes the snapshot in sections.mjs from the Hive API: every top-level post of @amaterasusolar newer than the newest article already listed
// is added at the TOP (same fields: title, permlink, date, words, tags, image, desc), using the same rules as the page's runtime top-up
// (main_js/list-topup.js hiveItem(): reblogs and comments are skipped, words = whitespace-separated words of the post body, desc = the first 420
// characters of its plain text, tags = the first 8 Hive tags). Existing entries are kept exactly as they are.
//
// Usage (from mes.fm/ama):
//   node update-articles.mjs              dry run: lists what would be added
//   node update-articles.mjs --apply      writes sections.mjs; then `npm run build` and diff index.html
//   node update-articles.mjs --check-all  also reads the whole account and reports posts missing from / gone from the snapshot
//   node update-articles.mjs --add-missing --apply   also puts older posts that the snapshot lacks into it, in date order
//
// Not needed for the page to show new articles (it tops itself up at load); this just keeps the committed list, the search index and the
// chip counts in the HTML current.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const T = require("../main_js/list-topup.js");
const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "sections.mjs");
const AUTHOR = "amaterasusolar";
const args = process.argv.slice(2);
const APPLY = args.includes("--apply"), ADD_MISSING = args.includes("--add-missing"), CHECK_ALL = ADD_MISSING || args.includes("--check-all");

async function call(params) {
  let lastErr;
  for (const node of T.HIVE_NODES) {
    try {
      const r = await fetch(node, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "bridge.get_account_posts", params, id: 1 }) });
      const j = await r.json();
      if (Array.isArray(j.result)) return j.result;
      lastErr = new Error(JSON.stringify(j.error || j).slice(0, 200));
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// Same line format as the existing entries (Python json.dumps style: ", " and ": ", non-ASCII kept as is).
function fmt(v) {
  if (Array.isArray(v)) return "[" + v.map(fmt).join(", ") + "]";
  return JSON.stringify(v);
}
function line(a) {
  return "{" + ["title", "permlink", "date", "words", "tags", "image", "desc"].map((k) => JSON.stringify(k) + ": " + fmt(a[k])).join(", ") + "},";
}

const src = readFileSync(FILE, "utf8");
const { ARTICLES } = await import("./sections.mjs?t=" + Date.now());
const known = new Set(ARTICLES.map((a) => a.permlink));

const fresh = [];
let start = null, done = false, pages = 0;
while (!done) {
  const params = { account: AUTHOR, sort: "posts", limit: 20, observer: "" };
  if (start) Object.assign(params, { start_author: start.author, start_permlink: start.permlink });
  const posts = await call(params); // bridge leaves the start post itself out
  pages++;
  if (!posts.length) break;
  for (const p of posts) {
    const it = T.hiveItem(p, AUTHOR);
    if (!it) continue;
    if (known.has(it.key) && !CHECK_ALL) { done = true; break; }
    fresh.push({ it, raw: p });
  }
  start = posts[posts.length - 1];
  if (pages > 200) break;
}

const add = [];
for (const { it, raw } of fresh) {
  if (known.has(it.key)) continue;
  const md = typeof raw.json_metadata === "string" ? JSON.parse(raw.json_metadata || "{}") : raw.json_metadata || {};
  add.push({ title: it.title, permlink: it.key, date: it.date, words: it.words, tags: it.tags, image: (Array.isArray(md.image) && md.image[0]) || "", desc: it.desc });
}
const newestKnown = ARTICLES[0] ? ARTICLES[0].date : "";
const newer = add.filter((a) => a.date >= newestKnown);
const older = add.filter((a) => a.date < newestKnown);

console.log(`Snapshot: ${ARTICLES.length} articles, newest ${newestKnown}.`);
console.log(newer.length ? `New since then (${newer.length}):` : "Nothing new.");
newer.forEach((a) => console.log(`  + ${a.date}  ${a.title}`));
if (CHECK_ALL) {
  const live = new Set(fresh.map((f) => f.it.key));
  console.log(`Account has ${live.size} top-level posts.`);
  older.forEach((a) => console.log(`  missing from the snapshot (older than its newest${ADD_MISSING ? "" : "; --add-missing adds it"}): ${a.date}  ${a.title}`));
  ARTICLES.filter((a) => !live.has(a.permlink)).forEach((a) => console.log(`  in the snapshot but no longer on Hive: ${a.date}  ${a.title}`));
}

const todo = newer.length + (ADD_MISSING ? older.length : 0);
if (APPLY && todo) {
  const marker = "export const ARTICLES = [\n";
  if (!src.includes(marker)) throw new Error("sections.mjs: ARTICLES marker not found");
  const today = new Date().toISOString().slice(0, 10);
  let out = src.replace(marker, marker + newer.map(line).join("\n") + (newer.length ? "\n" : ""));
  if (ADD_MISSING) {
    // each older post goes right before the first listed article dated earlier than it (so after any of the same day)
    for (const a of older) {
      const next = ARTICLES.find((x) => x.date < a.date);
      if (!next) { out = out.replace(/\n\];\s*$/, "\n" + line(a) + "\n];\n"); continue; }
      const at = out.indexOf('{"title": ' + JSON.stringify(next.title) + ', "permlink": ' + JSON.stringify(next.permlink));
      if (at < 0) throw new Error("could not place " + a.permlink);
      out = out.slice(0, at) + line(a) + "\n" + out.slice(at);
    }
  }
  out = out.replace(/^(\/\/ Content for mes\.fm\/ama .*?), fetched \d{4}-\d{2}-\d{2} from/m, `$1, fetched ${today} from`);
  writeFileSync(FILE, out, "utf8");
  console.log(`Wrote ${FILE} (+${todo}). Now run: npm run build (and diff index.html).`);
} else if (todo) {
  console.log("Dry run: pass --apply to write sections.mjs.");
}

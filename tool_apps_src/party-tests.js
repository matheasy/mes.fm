// node tool_apps_src/party-tests.js -- mes.fm/api/party.js against a fake Redis, plus the shared core (tool_apps_src/party/lib.js)
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const fs = require("fs"), path = require("path");
const store = new Map(), exp = new Map();
global.fetch = async (url, opts) => {
  const cmds = JSON.parse(opts.body);
  const hash = (k) => { if (!(store.get(k) instanceof Map)) store.set(k, new Map()); return store.get(k); };
  const out = cmds.map((c) => {
    const [op, k, a, b] = c;
    switch (op) {
      case "SET": { if (c.includes("NX") && store.has(k)) return { result: null }; store.set(k, a); const i = c.indexOf("EXAT"); if (i > 0) exp.set(k, c[i + 1]); return { result: "OK" }; }
      case "GET": return { result: typeof store.get(k) === "string" ? store.get(k) : null };
      case "INCR": { const v = (Number(store.get(k)) || 0) + 1; store.set(k, String(v)); return { result: v }; }
      case "EXPIRE": return { result: 1 };
      case "EXPIREAT": exp.set(k, a); return { result: 1 };
      case "HSET": hash(k).set(a, String(b)); return { result: 1 };
      case "HDEL": { const h = store.get(k); return { result: h instanceof Map && h.delete(a) ? 1 : 0 }; }
      case "HINCRBY": { const h = hash(k); const v = (Number(h.get(a)) || 0) + Number(b); h.set(a, String(v)); return { result: v }; }
      case "HGETALL": { const h = store.get(k); const r = []; if (h instanceof Map) for (const [x, y] of h) r.push(x, y); return { result: r }; }
      case "DEL": { let n = 0; for (const x of c.slice(1)) if (store.delete(x)) n++; return { result: n }; }
      default: throw new Error("fake redis: " + op);
    }
  });
  return { json: async () => out };
};
const h = require("../mes.fm/api/party.js");
const L = require("./party/lib.js");
let f = 0, n = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
let ipn = 1;
async function post(body, ip) {
  const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; } };
  const req = { method: "POST", body, headers: { "x-forwarded-for": ip || "10.0.0." + (ipn++ % 250), "content-type": "application/json" } };
  await h(req, res); return res;
}
const gid = (i) => (i.toString(16) + "f".repeat(32)).slice(0, 32);
const now = Date.now(), DAY = 864e5;

eq(fs.readFileSync(path.join(__dirname, "party/lib.js"), "utf8") === fs.readFileSync(path.join(__dirname, "../mes.fm/api/_party-lib.js"), "utf8"), true, "api copy of lib.js is byte-identical");

(async () => {
  const E = { act: "new", t: "  Mia's   30th ", d: "Bring\n\n\n\nsnacks", hn: "Mia", s: now + 7 * DAY, e: now + 7 * DAY + 5 * 36e5, z: "America/Vancouver", l: "123 Main St", lh: true,
    o: "zoom.us/j/1", th: "birthday", f: "script", em: "🎂", po: 2, cap: 5, dl: 0, q: ["Any allergies?"], br: ["Chips", "Drinks", " "], mb: true, gl: "all" };
  let r = await post(E); eq(r.code, 200, "create");
  const id = r.body.id, key = r.body.key;
  eq(/^[a-z0-9]{8}$/.test(id), true, "id shape"); eq(/^[a-f0-9]{32}$/.test(key), true, "key shape");
  const saved = JSON.parse(store.get("party:" + id));
  eq(saved.t, "Mia's 30th", "title cleaned"); eq(saved.d, "Bring\n\nsnacks", "description lines squeezed"); eq(saved.o, "https://zoom.us/j/1", "link gets https");
  eq(saved.br, ["Chips", "Drinks"], "empty item dropped"); eq(JSON.stringify(saved).includes(key), false, "key never stored"); eq(saved.kh.length, 64, "key hash stored");
  eq(exp.get("party:" + id), Math.ceil((E.e + L.KEEP) / 1000), "expires two months after the end");
  eq(r.body.owner, true, "creator is owner");

  // validation
  const bad = [[{ t: "" }, "no name"], [{ t: "x".repeat(121) }, "long name"], [{ s: now - 3 * DAY }, "past"], [{ s: "tomorrow" }, "date not a number"], [{ e: now }, "end before start"],
    [{ z: "Mars/Base" }, "bad zone"], [{ o: "not a link" }, "bad link"], [{ po: 11 }, "too many plus-ones"], [{ cap: -1 }, "negative cap"], [{ q: ["a", "b", "c", "d"] }, "4 questions"],
    [{ br: ["a", "A"] }, "duplicate item"], [{ zz: 1 }, "unknown field"]];
  for (const [o, m] of bad) { r = await post(Object.assign({}, E, o)); eq(r.code, 400, "rejects " + m); }

  // a stranger's view: location hidden, guest list shown
  r = await post({ act: "view", id, gid: gid(1) }); eq(r.code, 200, "view");
  eq(r.body.ev.l, "", "location hidden before replying"); eq(r.body.hidLoc, true, "says it is hidden"); eq(r.body.owner, false, "not owner");
  eq(r.body.ev.kh, undefined, "key hash never sent");
  r = await post({ act: "view", id, key }); eq(r.body.owner, true, "key makes owner"); eq(r.body.ev.l, "123 Main St", "host sees location");

  // replies
  r = await post({ act: "rsvp", id, gid: gid(1), s: "y", n: "Ann", p: 1, c: "yay", a: ["peanuts"], t: 100 }); eq(r.code, 400, "too fast");
  r = await post({ act: "rsvp", id, gid: gid(1), s: "y", n: "Ann", p: 3, t: 3000 }); eq(r.code, 400, "too many plus-ones");
  r = await post({ act: "rsvp", id, gid: gid(1), s: "y", n: "Ann", p: 1, c: "yay", a: ["peanuts"], t: 3000 }); eq(r.code, 200, "rsvp yes");
  eq(r.body.mine.s, "y", "mine"); eq(r.body.ev.l, "123 Main St", "location shown after replying"); eq(r.body.counts.y, 2, "2 people going");
  eq(r.body.guests[0].a, undefined, "answers not public");
  r = await post({ act: "rsvp", id, gid: gid(2), s: "y", n: "Bob", p: 2, t: 3000 }); eq(r.body.mine.w, 0, "Bob fits (5)");
  r = await post({ act: "rsvp", id, gid: gid(3), s: "y", n: "Cy", p: 0, t: 3000 }); eq(r.body.mine.w, 1, "Cy waitlisted #1"); eq(r.body.counts.w, 1, "1 waiting");
  r = await post({ act: "rsvp", id, gid: gid(4), s: "m", n: "Dee", t: 3000 }); eq(r.body.counts.mr, 1, "maybe counted");
  r = await post({ act: "rsvp", id, gid: gid(2), s: "n", n: "Bob", t: 3000 }); eq(r.body.counts.y, 3, "Bob drops, Cy moves in"); 
  r = await post({ act: "view", id, gid: gid(3) }); eq(r.body.mine.w, 0, "Cy moves up from the waitlist");
  r = await post({ act: "rsvp", id, gid: gid(5), s: "x", t: 3000 }); eq(r.code, 200, "remove nothing ok");

  // bring list
  r = await post({ act: "claim", id, gid: gid(6), it: "Chips", on: true }); eq(r.code, 409, "must reply first");
  r = await post({ act: "claim", id, gid: gid(1), it: "Chips", on: true }); eq(r.code, 200, "claim"); eq(r.body.bring[0], { it: "Chips", taken: true, mine: true, by: "Ann" }, "claimed by me");
  r = await post({ act: "claim", id, gid: gid(3), it: "Chips", on: true }); eq(r.code, 409, "already taken");
  r = await post({ act: "claim", id, gid: gid(3), it: "Chips", on: false }); eq(r.code, 403, "cannot free someone else's");
  r = await post({ act: "claim", id, gid: gid(1), it: "Nope", on: true }); eq(r.code, 404, "unknown item");

  // host
  r = await post({ act: "post", id, key: "0".repeat(32), m: "hi" }); eq(r.code, 403, "wrong key");
  r = await post({ act: "post", id, key, m: "Parking is on 2nd Ave" }); eq(r.body.ev.u[0].m, "Parking is on 2nd Ave", "update posted");
  r = await post({ act: "hadd", id, key, s: "y", n: "Grandma", p: 4, t: 0 }); eq(r.code, 200, "host adds a guest"); 
  const gk = r.body.guests.find((g) => g.n === "Grandma").k; eq(/^h/.test(gk), true, "host-added key");
  eq(r.body.guests.find((g) => g.n === "Ann").a, ["peanuts"], "host sees answers");
  r = await post({ act: "hdel", id, key, k: gk }); eq(r.body.guests.some((g) => g.n === "Grandma"), false, "host removes");
  const E2 = Object.assign({}, E, { act: "edit", id, key, br: ["Drinks", "Cake"] });
  r = await post(E2); eq(r.code, 200, "edit"); eq(r.body.bring.map((b) => b.it), ["Drinks", "Cake"], "items edited"); eq(store.get("party:" + id + ":i").size, 0, "orphan claim dropped");
  eq(r.body.ev.u.length, 1, "edit keeps updates");
  r = await post({ act: "close", id, key, on: true }); eq(r.body.open, false, "closed");
  r = await post({ act: "rsvp", id, gid: gid(9), s: "y", n: "Late", t: 3000 }); eq(r.code, 409, "no replies when closed");
  r = await post({ act: "close", id, key, on: false });
  // guest list for count-only events
  r = await post(Object.assign({}, E, { act: "edit", id, key, gl: "count" })); r = await post({ act: "view", id, gid: gid(4) });
  eq(r.body.guests, null, "count-only hides names"); eq(typeof r.body.counts.y, "number", "counts still shown");
  r = await post(Object.assign({}, E, { act: "edit", id, key, gl: "host" })); r = await post({ act: "view", id, gid: gid(4) });
  eq(r.body.counts, null, "host-only hides counts");
  // network limit
  for (let i = 0; i < 12; i++) await post({ act: "rsvp", id, gid: gid(100 + i), s: "n", n: "N" + i, t: 3000 }, "9.9.9.9");
  r = await post({ act: "rsvp", id, gid: gid(200), s: "n", n: "Z", t: 3000 }, "9.9.9.9"); eq(r.code, 409, "12 per network");
  // delete
  r = await post({ act: "del", id, key }); eq(r.body.deleted, true, "deleted"); eq(store.has("party:" + id), false, "gone");

  // ---- lib helpers
  const z = "America/Vancouver";
  eq(L.toLocal(L.fromLocal("2026-03-08", "14:30", z), z), { date: "2026-03-08", time: "14:30" }, "local time round trip across DST");
  eq(L.toLocal(L.fromLocal("2026-07-01", "09:05", "Europe/London"), "Europe/London"), { date: "2026-07-01", time: "09:05" }, "London summer");
  const ev = { t: "Game, night; fun", d: "line1\nline2", s: Date.UTC(2026, 11, 5, 3), e: 0, z, l: "Here", o: "", x: 0 };
  const cal = L.ics(ev, "abc", "https://mes.fm/p/abc", Date.UTC(2026, 0, 1));
  eq(/SUMMARY:Game\\, night\\; fun/.test(cal), true, "ics escapes"); eq(/DTSTART:20261205T030000Z/.test(cal), true, "ics start"); eq(/DTEND:20261205T070000Z/.test(cal), true, "ics default 4h end");
  eq(cal.split("\r\n").every((l) => l.length <= 75), true, "ics lines folded");
  eq(/dates=20261205T030000Z\/20261205T070000Z/.test(L.googleCal(ev, "u")), true, "google link");
  eq(L.fromNow(now + 3 * DAY, now), "in 3 days", "fromNow days"); eq(L.fromNow(now - 60000, now, now + 36e5), "happening now", "happening now");
  eq(L.countdown(now + DAY + 3661000, now), { d: 1, h: 1, m: 1, s: 1 }, "countdown");
  const csv = L.guestCsv({ ev: { q: ["Q"] }, guests: [{ n: "=evil", s: "y", p: 1, c: 'say "hi"', a: ["x"], t: 0, w: 0 }] });
  eq(csv.split("\r\n")[1].startsWith("\"'=evil\""), true, "csv blocks formulas"); eq(csv.includes('"say ""hi"""'), true, "csv quotes");
  eq(L.link("example.com/a?b=1"), "https://example.com/a?b=1", "link"); eq(L.link("javascript:alert(1)"), null, "no js links");
  eq(L.themeOf("nope").id, "confetti", "default theme");
  console.log((n - f) + "/" + n + " passed");
  process.exit(f ? 1 : 0);
})();

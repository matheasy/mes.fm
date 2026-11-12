// node tool_apps_src/polls-tests.js  -- runs mes.fm/api/poll.js against a fake Redis, plus the page's pure helpers (tool_apps_src/polls/lib.js)
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const store = new Map(), exp = new Map();
let calls = 0;
global.fetch = async (url, opts) => {
  calls++;
  const cmds = JSON.parse(opts.body);
  const hash = (k) => { if (!store.has(k)) store.set(k, new Map()); return store.get(k); };
  const out = cmds.map((c) => {
    const [op, k, a, b] = c;
    switch (op) {
      case "SET": { if (c.includes("NX") && store.has(k)) return { result: null }; store.set(k, a); const i = c.indexOf("EXAT"); if (i > 0) exp.set(k, c[i + 1]); return { result: "OK" }; }
      case "GET": return { result: typeof store.get(k) === "string" ? store.get(k) : null };
      case "INCR": { const v = (Number(store.get(k)) || 0) + 1; store.set(k, String(v)); return { result: v }; }
      case "EXPIRE": return { result: 1 };
      case "EXPIREAT": exp.set(k, a); return { result: 1 };
      case "HGET": { const h = store.get(k); return { result: h instanceof Map && h.has(a) ? h.get(a) : null }; }
      case "HSET": hash(k).set(a, String(b)); return { result: 1 };
      case "HSETNX": { const h = hash(k); if (h.has(a)) return { result: 0 }; h.set(a, String(b)); return { result: 1 }; }
      case "HINCRBY": { const h = hash(k); const v = (Number(h.get(a)) || 0) + Number(b); h.set(a, String(v)); return { result: v }; }
      case "HGETALL": { const h = store.get(k); const r = []; if (h instanceof Map) for (const [x, y] of h) r.push(x, y); return { result: r }; }
      case "HLEN": { const h = store.get(k); return { result: h instanceof Map ? h.size : 0 }; }
      case "ZINCRBY": { const z = hash(k); const v = (Number(z.get(b)) || 0) + Number(a); z.set(b, String(v)); return { result: String(v) }; }
      case "ZREM": { const z = store.get(k); return { result: z instanceof Map && z.delete(a) ? 1 : 0 }; }
      case "ZREVRANGE": { const z = store.get(k); const r = []; if (z instanceof Map) [...z].sort((x, y) => y[1] - x[1]).slice(Number(a), Number(b) + 1).forEach(([m, sc]) => r.push(m, sc)); return { result: r }; }
      case "DEL": { let n = 0; for (const x of c.slice(1)) if (store.delete(x)) n++; return { result: n }; }
      default: throw new Error("fake redis: " + op);
    }
  });
  return { json: async () => out };
};
const h = require("../mes.fm/api/poll.js");
const L = require("./polls/lib.js");
let f = 0, n = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
let ipn = 1;
function mk(method, o) {
  const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, end() { return this; } };
  const headers = Object.assign({ "x-forwarded-for": "10.0.0." + (ipn++ % 250), "content-type": "application/json" }, (o && o.headers) || {});
  return { req: Object.assign({ method, query: {}, body: null }, o, { headers }), res };
}
async function post(body, extra) { const { req, res } = mk("POST", Object.assign({ body }, extra || {})); await h(req, res); return res; }
async function get(id) { const { req, res } = mk("GET", { query: { id } }); await h(req, res); return res; }
const vid = (i) => (i.toString(16) + "0".repeat(32)).slice(0, 32).replace(/[^a-f0-9]/g, "a");
const P = { act: "new", q: "  Best   pizza topping? ", d: "Line 1\n\n\n\nLine 2", o: ["Cheese", " Pepperoni ", "", "Pineapple"], m: 1, cl: 0, sh: "always", ch: false };

(async () => {
  // ---- create
  let r = await post(P); eq(r.code, 200, "create");
  const id = r.body.id, key = r.body.key;
  eq(/^[a-z0-9]{8}$/.test(id), true, "id shape"); eq(/^[a-f0-9]{32}$/.test(key), true, "key shape");
  const saved = JSON.parse(store.get("poll:" + id));
  eq(saved.q, "Best pizza topping?", "question cleaned"); eq(saved.d, "Line 1\n\nLine 2", "description keeps up to one blank line");
  eq(saved.o, ["Cheese", "Pepperoni", "Pineapple"], "empty option dropped, trimmed"); eq(saved.h !== key && saved.h.length === 64, true, "only a hash of the key stored");
  eq(JSON.stringify(saved).includes(key), false, "key never stored");
  r = await get(id); eq(r.code, 200, "read"); eq(r.body.n, [0, 0, 0], "always: counts shown"); eq(r.body.open, true, "open");
  eq(/s-maxage=3/.test(r.headers["Cache-Control"]), true, "open poll cached 3 s");
  eq(r.headers["X-Robots-Tag"], "noindex", "noindex header");

  // ---- validation
  const bad = [[{ q: "" }, "empty question"], [{ q: "x".repeat(201) }, "long question"], [{ d: "x".repeat(601) }, "long description"],
    [{ o: ["a"] }, "one option"], [{ o: ["a", "A"] }, "duplicate (case)"], [{ o: Array.from({ length: 21 }, (_, i) => "o" + i) }, "21 options"],
    [{ o: ["a", "x".repeat(101)] }, "long option"], [{ o: "a,b" }, "options not array"], [{ o: ["a", 5] }, "option not string"],
    [{ m: 4 }, "m > options"], [{ m: 0 }, "m 0"], [{ m: 1.5 }, "m fraction"], [{ cl: Date.now() + 1000 }, "closes in a second"],
    [{ cl: Date.now() + 400 * 86400000 }, "closes after a year"], [{ cl: "tomorrow" }, "cl text"], [{ sh: "never" }, "bad sh"],
    [{ ch: "yes" }, "ch not bool"], [{ evil: 1 }, "unknown field"], [{ q: ["a"] }, "q array"]];
  for (const [b, m] of bad) { r = await post(Object.assign({}, P, b)); eq(r.code, 400, "refuses " + m); }
  r = await post(Object.assign({}, P, { cl: Date.now() + 3600000 })); eq(r.code, 200, "accepts a closing time an hour away");
  r = await post("not json"); eq(r.code, 400, "bad json");
  r = await post(P, { headers: { "content-type": "text/plain" } }); eq(r.code, 415, "json only");
  r = await post({ act: "new", q: "x".repeat(7000) }); eq(r.code, 400, "too big");
  r = await post({ act: "dance", id }); eq(r.code, 400, "unknown action");
  { const { req, res } = mk("PUT", {}); await h(req, res); eq(res.code, 405, "method"); }
  r = await get("../etc"); eq(r.code, 404, "bad id"); r = await get("zzzzzzzz"); eq(r.code, 404, "unknown id");
  process.env.VERCEL_ENV = "production";
  r = await post(P, { headers: { origin: "https://evil.example" } }); eq(r.code, 403, "origin checked in production");
  r = await post(P, { headers: { origin: "https://mes.fm" } }); eq(r.code, 200, "mes.fm origin ok");
  delete process.env.VERCEL_ENV;

  // ---- voting
  const V = (i, picks, extra) => post({ act: "vote", id, vid: vid(i), picks, t: 5000 }, extra);
  r = await V(1, [1]); eq(r.code, 200, "vote"); eq(r.body.mine, [1], "mine"); eq(r.body.poll.n, [0, 1, 0], "count up"); eq(r.body.poll.v, 1, "1 voter");
  r = await V(1, [2]); eq(r.code, 409, "second vote refused (no changes)"); eq(r.body.mine, [1], "says what you voted");
  r = await V(2, [0, 1]); eq(r.code, 400, "two picks on single choice");
  r = await V(2, [7]); eq(r.code, 400, "pick out of range"); r = await V(2, []); eq(r.code, 400, "no pick"); r = await V(2, ["1"]); eq(r.code, 400, "pick as string");
  r = await post({ act: "vote", id, vid: vid(3), picks: [0], t: 100 }); eq(r.code, 400, "too fast");
  r = await post({ act: "vote", id, vid: "nothex", picks: [0], t: 5000 }); eq(r.code, 400, "bad voter id");
  r = await post({ act: "vote", id, vid: vid(3), picks: [0], t: 5000, hp: "bot" }); eq(r.code, 200, "honeypot pretends"); eq(JSON.parse(JSON.stringify((await get(id)).body.n)), [0, 1, 0], "honeypot stored nothing");
  // per-network cap
  const net = { headers: { "x-forwarded-for": "8.8.8.8" } };
  for (let i = 0; i < h._test.IP_POLL; i++) { r = await V(100 + i, [0], net); eq(r.code, 200, "network vote " + i); }
  r = await V(200, [0], net); eq(r.code, 409, "network cap"); eq(/network/.test(r.body.error), true, "cap explained");
  r = await V(201, [0], { headers: { "x-forwarded-for": "8.8.4.4" } }); eq(r.code, 200, "other network fine");
  r = await get(id); eq(r.body.n, [h._test.IP_POLL + 1, 1, 0], "totals"); eq(r.body.v, h._test.IP_POLL + 2, "voters");
  // vote rate limit per IP
  const rl = { headers: { "x-forwarded-for": "7.7.7.7" } };
  let last; for (let i = 0; i < h._test.LIM.v + 1; i++) last = await post({ act: "vote", id, vid: vid(1), picks: [0], t: 5000 }, rl);
  eq(last.code, 429, "vote rate limit");

  // ---- multiple choice, change vote, results after voting
  r = await post(Object.assign({}, P, { o: ["A", "B", "C", "D"], m: 2, sh: "voted", ch: true })); const id2 = r.body.id, key2 = r.body.key;
  r = await get(id2); eq(r.body.n, undefined, "voted: no counts before voting");
  r = await post({ act: "vote", id: id2, vid: vid(5), picks: [3, 0], t: 5000 }); eq(r.body.mine, [0, 3], "picks sorted"); eq(r.body.poll.n, [1, 0, 0, 1], "results shown to the voter");
  r = await post({ act: "vote", id: id2, vid: vid(5), picks: [0, 1, 2], t: 5000 }); eq(r.code, 400, "3 picks when max 2");
  r = await post({ act: "vote", id: id2, vid: vid(5), picks: [1, 0], t: 5000 }); eq(r.code, 200, "change allowed"); eq(r.body.changed, true, "changed flag"); eq(r.body.poll.n, [1, 1, 0, 0], "moved D -> B"); eq(r.body.poll.v, 1, "still one voter");
  r = await post({ act: "vote", id: id2, vid: vid(5), picks: [0, 1], t: 5000 }); eq(r.body.poll.n, [1, 1, 0, 0], "same vote again: no change");
  r = await post({ act: "vote", id: id2, vid: vid(5), picks: [0, 1, 0], t: 5000 }); eq(r.code, 400, "duplicate pick refused");
  r = await get(id2); eq(r.body.n, undefined, "voted: public read still hidden");
  r = await post({ act: "peek", id: id2, vid: vid(5) }); eq(r.body.poll.n, [1, 1, 0, 0], "peek as voter"); eq(r.body.mine, [0, 1], "peek mine");
  r = await post({ act: "peek", id: id2, vid: vid(6) }); eq(r.body.poll.n, undefined, "peek as non-voter: hidden"); eq(r.body.mine, null, "no mine");
  r = await post({ act: "peek", id: id2, key: key2 }); eq(r.body.poll.n, [1, 1, 0, 0], "creator sees results"); eq(r.body.owner, true, "owner flag");
  r = await post({ act: "peek", id: id2, key: key }); eq(r.body.owner, false, "other poll's key is no key");

  // ---- results after closing, close / delete
  r = await post(Object.assign({}, P, { sh: "closed" })); const id3 = r.body.id, key3 = r.body.key;
  r = await post({ act: "vote", id: id3, vid: vid(9), picks: [2], t: 5000 }); eq(r.body.poll.n, undefined, "closed-mode: hidden after voting");
  r = await post({ act: "close", id: id3, key: key2 }); eq(r.code, 403, "wrong key cannot close");
  r = await post({ act: "close", id: id3, key: "x" }); eq(r.code, 403, "bad key shape");
  r = await post({ act: "close", id: id3, key: key3 }); eq(r.code, 200, "creator closes"); eq(r.body.poll.open, false, "closed");
  r = await get(id3); eq(r.body.open, false, "closed for everyone"); eq(r.body.n, [0, 0, 1], "results shown once closed"); eq(/s-maxage=300/.test(r.headers["Cache-Control"]), true, "closed poll cached longer");
  r = await post({ act: "vote", id: id3, vid: vid(10), picks: [0], t: 5000 }); eq(r.code, 409, "closed poll refuses votes");
  const e3 = exp.get("poll:" + id3); eq(Math.abs(e3 * 1000 - (Date.now() + h._test.KEEP)) < 5000, true, "kept 60 days after closing");
  eq(exp.get("poll:" + id3 + ":n"), e3, "counts expire with it");
  r = await post({ act: "del", id: id3, key: key3 }); eq(r.code, 200, "delete"); eq(store.has("poll:" + id3) || store.has("poll:" + id3 + ":b"), false, "all keys gone");
  r = await get(id3); eq(r.code, 404, "deleted poll is gone");
  // timed poll closes by itself
  r = await post(Object.assign({}, P, { cl: Date.now() + 120000 })); const id4 = r.body.id;
  const p4 = JSON.parse(store.get("poll:" + id4)); p4.cl = Date.now() - 1; store.set("poll:" + id4, JSON.stringify(p4));
  r = await post({ act: "vote", id: id4, vid: vid(11), picks: [0], t: 5000 }); eq(r.code, 409, "past closing time refuses votes");
  // manual poll expiry horizon
  eq(h._test.closesAt({ c: 1000, cl: 0, x: 0 }), 1000 + h._test.MAX_OPEN, "open-until-closed polls stop after a year");

  // ---- create rate limit
  const cn = { headers: { "x-forwarded-for": "6.6.6.6" } };
  for (let i = 0; i < h._test.LIM.n + 1; i++) last = await post(P, cn);
  eq(last.code, 429, "create rate limit");

  // ---- lib.js (page helpers)
  const pc = L.percents([1, 1, 1]); eq(pc.reduce((a, b) => a + b, 0), 100, "percents add to 100"); eq(L.percents([0, 0]), [0, 0], "no votes -> zeros");
  eq(L.percents([3, 1]), [75, 25], "75/25"); eq(L.percents([2, 1], 1), [66.7, 33.3], "one decimal");
  eq(L.leaders([2, 5, 5, 1]), [1, 2], "tie for first"); eq(L.leaders([0, 0]), [], "no leader with no votes");
  eq(L.left(90061000), "1 day 1 hour", "time left days"); eq(L.left(3725000), "1 hour 2 min", "time left hours"); eq(L.left(59000), "59 s", "seconds"); eq(L.left(-5), "0 s", "never negative");
  eq(L.durMs(90, "min"), 5400000, "duration minutes"); eq(L.durMs(2, "day"), 172800000, "duration days"); eq(L.durMs(1, "week"), 604800000, "week");
  eq(L.optionsFromText("Red\n\n- Blue\n* Green\n1. Yellow\n2) Black"), ["Red", "Blue", "Green", "Yellow", "Black"], "paste list");
  eq(L.optionsFromText("Red, Blue, Green"), ["Red", "Blue", "Green"], "comma list on one line");
  eq(L.idFromText("https://mes.fm/v/ab3defgh"), "ab3defgh", "id from link"); eq(L.idFromText("mes.fm/polls?p=ab3defgh"), "ab3defgh", "id from long link"); eq(L.idFromText("nope"), null, "not a poll");
  eq(L.problems({ q: "", o: ["a"] }).length >= 2, true, "client checks");
  eq(L.problems({ q: "Q?", o: ["a", "b"], m: 1 }), [], "valid draft");
  eq(L.problems({ q: "Q?", o: ["a", "A"], m: 1 })[0], "Two options are the same: A", "duplicate in draft");

  // ---- Hive Open Polls (lib.hive) against a real PeakD poll: tarazkp/is-hivefest-still-relevant, votes read from the chain
  const H = L.hive, fx = require("./polls/fixtures/tarazkp-is-hivefest-still-relevant.json");
  const hp = H.parse(fx.post);
  eq([hp.question, hp.choices.length, hp.max, hp.changes, hp.ageDays, hp.end], ["Is HiveFest still Relevant?", 2, 1, true, 0, 1761516213000], "parse PeakD poll metadata");
  eq(H.parse({ author: "a", permlink: "b", json_metadata: "{\"app\":\"peakd\"}" }), null, "a normal post is not a poll");
  const hv = []; let nomatch = 0;
  for (const a in fx.ops) for (const o of fx.ops[a]) { const v = H.parseVote(o, hp, fx.api.poll_trx_id); if (v) hv.push(v); else nomatch++; }
  eq(nomatch, 0, "every recorded op parses (author/permlink and trx-id forms)");
  const hr = H.count(hp, hv, fx.created);
  eq(hr.n, fx.api.poll_choices.map((c) => c.votes ? c.votes.total_votes : 0), "our count = PeakD's open-polls node");
  eq(hr.v, fx.api.poll_stats.total_voting_accounts_num, "voting accounts = PeakD's");
  const apiBy = {}; fx.api.poll_voters.forEach((v) => apiBy[v.name] = v.choices.join());
  eq(hr.voters.filter((v) => apiBy[v.a] !== v.choices.join()).length, 0, "every voter's choice = PeakD's");
  const anti = hv.filter((v) => v.a === "antisocialist"); eq(anti.length >= 1, true, "antisocialist's votes present");
  // rules on a made-up poll
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  const mp = { author: "me", permlink: "p", choices: ["A", "B", "C"], created: t0, end: t0 + 864e5, max: 1, changes: true, ageDays: 0 };
  const HV = (a, ch, mins) => ({ a, choices: ch, t: t0 + mins * 60000 });
  eq(H.count(mp, [HV("x", [1], 1), HV("x", [2], 5)]).n, [0, 1, 0], "latest vote wins");
  eq(H.count(Object.assign({}, mp, { changes: false }), [HV("x", [1], 1), HV("x", [2], 5)]).n, [1, 0, 0], "no changes: first vote wins");
  eq(H.count(mp, [HV("x", [1], 1), HV("x", [], 5)]).v, 0, "[] removes the vote");
  eq(H.count(mp, [HV("x", [1], 1), HV("x", [3], 60 * 25)]).n, [1, 0, 0], "votes after end_time ignored");
  eq(H.count(mp, [HV("x", [1], -5)]).v, 0, "votes before the post ignored");
  eq(H.count(mp, [HV("x", [1, 2], 1)]).v, 0, "two picks on a single-choice poll ignored");
  eq(H.count(Object.assign({}, mp, { max: 2 }), [HV("x", [3, 1], 1)]).n, [1, 0, 1], "multiple choice up to max");
  eq(H.count(mp, [HV("x", [4], 1), HV("y", [0], 1), HV("z", [1.5], 1), HV("w", ["1"], 1)]).v, 0, "bad choice numbers ignored");
  eq(H.count(mp, [HV("x", [2], 1), HV("x", [9], 2)]).n, [0, 1, 0], "an invalid later vote does not replace a valid one");
  const ag = Object.assign({}, mp, { ageDays: 30 });
  const agr = H.count(ag, [HV("old", [1], 1), HV("new", [2], 1), HV("nobody", [3], 1)], { old: "2020-01-01T00:00:00", new: "2025-12-25T00:00:00" });
  eq([agr.n, agr.skipped.map((x) => x.a).sort()], [[1, 0, 0], ["new", "nobody"]], "account_age filter at the time of the vote");
  eq(H.parseVote({ json: "{\"poll\":\"me/p\",\"choice\":2}", t: t0, auths: ["q"] }, mp).choices, [2], "0.1 spec form {choice: n}");
  eq(H.parseVote({ json: "{\"poll\":\"me/p\",\"choice\":0}", t: t0, auths: ["q"] }, mp).choices, [], "0.1 choice 0 = remove");
  eq(H.parseVote({ json: "{\"poll\":\"me/other\",\"action\":\"vote\",\"choices\":[1]}", t: t0, auths: ["q"] }, mp), null, "other poll ignored");
  eq(H.parseVote({ json: "not json", t: t0, auths: ["q"] }, mp), null, "bad json ignored");
  eq(H.voteJson(mp, [2, 1]), "{\"poll\":\"me/p\",\"action\":\"vote\",\"choices\":[1,2]}", "vote json exactly like PeakD's");
  eq(H.ref("https://peakd.com/hive-104500/@tarazkp/is-hivefest-still-relevant"), { author: "tarazkp", permlink: "is-hivefest-still-relevant" }, "ref from a PeakD link");
  eq(H.ref("@mes.fm/x-1"), { author: "mes.fm", permlink: "x-1" }, "ref with a dot");
  eq(H.ref("nope"), null, "no ref");
  eq(H.tags("Polls, #Hive  fun!! fun"), ["polls", "hive", "fun"], "tags cleaned");
  eq(/^which-day-[a-z0-9]+$/.test(H.permlink("Which day?", t0)), true, "permlink from title");
  const now = t0;
  const draft = { title: "Which day?", body: "text", question: "Which day?", choices: ["Mon", "Tue", ""], endMs: now + 3 * 864e5, tags: ["polls", "hive"], max: 2, changes: true, hide: false, ageDays: 7, description: "d" };
  eq(H.problems(draft, now), [], "valid Hive draft");
  eq(H.problems(Object.assign({}, draft, { endMs: now + 40 * 864e5 }), now).length, 1, "over 30 days refused");
  eq(H.problems(Object.assign({}, draft, { endMs: NaN }), now)[0], "Hive polls need an end time.", "end time required");
  eq(H.problems(Object.assign({}, draft, { tags: [], community: "" }), now).length, 1, "a tag or community needed");
  const bp = H.buildPost(draft, now), bm = JSON.parse(bp.meta);
  eq([bp.parentPermlink, bm.content_type, bm.version, bm.question, bm.choices, bm.preferred_interpretation, bm.end_time, bm.filters, bm.allow_vote_changes, bm.ui_hide_res_until_voted, bm.max_choices_voted],
    ["polls", "poll", 0.8, "Which day?", ["Mon", "Tue"], "number_of_votes", Math.floor((now + 3 * 864e5) / 1000), { account_age: 7 }, true, false, 2], "post metadata like PeakD's");
  eq(H.parse({ author: "me", permlink: bp.permlink, created: new Date(now).toISOString(), json_metadata: bp.meta }).choices, ["Mon", "Tue"], "our post parses back");
  eq(H.buildPost(Object.assign({}, draft, { community: "hive-104500" }), now).parentPermlink, "hive-104500", "community is the parent");
  eq("max_choices_voted" in JSON.parse(H.buildPost(Object.assign({}, draft, { max: 1 }), now).meta), false, "single choice leaves max out");

  // ---- moderation: slur filter, reports, hiding, review queue
  const T = h._test;
  for (const [q, want] of [["you n1gger", true], ["F A G", true], ["dumb retards", true], ["sp1c", true], ["n.i.g.g.a", true], ["Wetback", true],
    ["Best pizza topping?", false], ["fire retardant", false], ["raccoon", false], ["Niagara Falls", false], ["snigger", false], ["spicy food", false], ["bigger gerbil", false]])
    eq(T.hasSlur({ q, d: "", o: ["a", "b"] }), want, "slur filter: " + q);
  r = await post(Object.assign({}, P, { o: ["Cheese", "k1kes"] })); eq(r.code, 400, "poll with a slur in an option refused");
  r = await post(Object.assign({}, P, { q: "Which raccoon is cuter?" })); eq(r.code, 200, "normal poll accepted");
  const rid = r.body.id, rkey = r.body.key;
  const R = (i, rr, ip) => post({ act: "report", id: rid, vid: vid(500 + i), r: rr }, ip ? { headers: { "x-forwarded-for": ip } } : undefined);
  r = await R(1, "rude"); eq(r.code, 400, "report needs a known reason");
  r = await post({ act: "report", id: rid, vid: "x", r: "spam" }); eq(r.code, 400, "report needs a browser id");
  r = await R(1, "spam", "9.9.9.1"); eq([r.code, r.body.hidden], [200, false], "first report");
  r = await R(1, "hate", "9.9.9.1"); eq(r.body.again, true, "same browser reports once");
  r = await R(2, "spam", "9.9.9.1"); eq(r.body.hidden, false, "second browser on the same network does not count twice");
  r = await R(3, "hate", "9.9.9.2"); eq(r.body.hidden, false, "two networks: still shown");
  r = await R(4, "hate", "9.9.9.3"); eq(r.body.hidden, true, "three networks hide it");
  r = await get(rid); eq([r.code, r.body.hidden], [410, true], "hidden poll answers 410");
  r = await post({ act: "vote", id: rid, vid: vid(900), picks: [0], t: 5000 }); eq(r.code, 410, "no votes on a hidden poll");
  r = await post({ act: "peek", id: rid, vid: vid(900) }); eq(r.code, 410, "others can't peek");
  r = await post({ act: "peek", id: rid, key: rkey }); eq([r.code, r.body.poll.hidden], [200, true], "the maker still sees it, marked hidden");
  r = await post({ act: "report", id: "zzzzzzzz", vid: vid(1), r: "spam" }); eq(r.code, 404, "report unknown poll");
  r = await post({ act: "reported", admin: "x".repeat(40) }); eq(r.code, 403, "queue closed without POLL_ADMIN_KEY");
  process.env.POLL_ADMIN_KEY = "a".repeat(40);
  r = await post({ act: "reported", admin: "b".repeat(40) }); eq(r.code, 403, "wrong admin key");
  r = await post({ act: "reported", admin: "a".repeat(40) }); eq(r.code, 200, "queue");
  eq(r.body.polls.length, 1, "one reported poll"); eq(r.body.polls[0].why, { spam: 2, hate: 2 }, "reasons counted"); eq(r.body.polls[0].hidden, true, "shown as hidden");
  r = await post({ act: "mod", id: rid, admin: "a".repeat(40), do: "ok" }); eq(r.body.hidden, false, "moderator keeps it");
  r = await get(rid); eq(r.code, 200, "visible again");
  r = await post({ act: "reported", admin: "a".repeat(40) }); eq(r.body.polls.length, 0, "queue cleared");
  r = await post({ act: "mod", id: rid, admin: "a".repeat(40), do: "hide" }); r = await get(rid); eq(r.code, 410, "moderator hides");
  r = await post({ act: "mod", id: rid, admin: "a".repeat(40), do: "del" }); r = await get(rid); eq(r.code, 404, "moderator deletes");
  r = await post({ act: "mod", id: rid, admin: "a".repeat(40), do: "dance" }); eq(r.code, 404, "gone poll");
  delete process.env.POLL_ADMIN_KEY;

  delete process.env.UPSTASH_REDIS_REST_URL; r = await get(id); eq(r.code, 503, "503 without Redis");
  console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
})();

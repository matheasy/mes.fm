// Search Console numbers for the private mes.fm/ads page (api/earnings.js ?gsc=1 and ?vs=1): reads what
// google-ads/search-console-gsc-script.js stored (see api/search-console.js for the keys) and joins it to the ads data
// by day, landing page (normalised path) and country. Search Console's countries are lowercase ISO 3166 alpha-3
// ("arg"), Google Ads' and AdSense's are alpha-2 ("AR").
// Which breakdown: pages -> p (complete page totals; b on days stored before p existed), countries -> a (complete),
// page AND country -> b (Search Console leaves small rows out of page x country x device, so it reads low; said on the page).
const ISO3 = 'abw:AW,afg:AF,ago:AO,aia:AI,ala:AX,alb:AL,and:AD,are:AE,arg:AR,arm:AM,asm:AS,ata:AQ,atf:TF,atg:AG,aus:AU,aut:AT,aze:AZ,bdi:BI,bel:BE,ben:BJ,bes:BQ,bfa:BF,bgd:BD,bgr:BG,bhr:BH,bhs:BS,bih:BA,blm:BL,blr:BY,blz:BZ,bmu:BM,bol:BO,bra:BR,brb:BB,brn:BN,btn:BT,bvt:BV,bwa:BW,caf:CF,can:CA,cck:CC,che:CH,chl:CL,chn:CN,civ:CI,cmr:CM,cod:CD,cog:CG,cok:CK,col:CO,com:KM,cpv:CV,cri:CR,cub:CU,cuw:CW,cxr:CX,cym:KY,cyp:CY,cze:CZ,deu:DE,dji:DJ,dma:DM,dnk:DK,dom:DO,dza:DZ,ecu:EC,egy:EG,eri:ER,esh:EH,esp:ES,est:EE,eth:ET,fin:FI,fji:FJ,flk:FK,fra:FR,fro:FO,fsm:FM,gab:GA,gbr:GB,geo:GE,ggy:GG,gha:GH,gib:GI,gin:GN,glp:GP,gmb:GM,gnb:GW,gnq:GQ,grc:GR,grd:GD,grl:GL,gtm:GT,guf:GF,gum:GU,guy:GY,hkg:HK,hmd:HM,hnd:HN,hrv:HR,hti:HT,hun:HU,idn:ID,imn:IM,ind:IN,iot:IO,irl:IE,irn:IR,irq:IQ,isl:IS,isr:IL,ita:IT,jam:JM,jey:JE,jor:JO,jpn:JP,kaz:KZ,ken:KE,kgz:KG,khm:KH,kir:KI,kna:KN,kor:KR,kwt:KW,lao:LA,lbn:LB,lbr:LR,lby:LY,lca:LC,lie:LI,lka:LK,lso:LS,ltu:LT,lux:LU,lva:LV,mac:MO,maf:MF,mar:MA,mco:MC,mda:MD,mdg:MG,mdv:MV,mex:MX,mhl:MH,mkd:MK,mli:ML,mlt:MT,mmr:MM,mne:ME,mng:MN,mnp:MP,moz:MZ,mrt:MR,msr:MS,mtq:MQ,mus:MU,mwi:MW,mys:MY,myt:YT,nam:NA,ncl:NC,ner:NE,nfk:NF,nga:NG,nic:NI,niu:NU,nld:NL,nor:NO,npl:NP,nru:NR,nzl:NZ,omn:OM,pak:PK,pan:PA,pcn:PN,per:PE,phl:PH,plw:PW,png:PG,pol:PL,pri:PR,prk:KP,prt:PT,pry:PY,pse:PS,pyf:PF,qat:QA,reu:RE,rou:RO,rus:RU,rwa:RW,sau:SA,sdn:SD,sen:SN,sgp:SG,sgs:GS,shn:SH,sjm:SJ,slb:SB,sle:SL,slv:SV,smr:SM,som:SO,spm:PM,srb:RS,ssd:SS,stp:ST,sur:SR,svk:SK,svn:SI,swe:SE,swz:SZ,sxm:SX,syc:SC,syr:SY,tca:TC,tcd:TD,tgo:TG,tha:TH,tjk:TJ,tkl:TK,tkm:TM,tls:TL,ton:TO,tto:TT,tun:TN,tur:TR,tuv:TV,twn:TW,tza:TZ,uga:UG,ukr:UA,umi:UM,ury:UY,usa:US,uzb:UZ,vat:VA,vct:VC,ven:VE,vgb:VG,vir:VI,vnm:VN,vut:VU,wlf:WF,wsm:WS,yem:YE,zaf:ZA,zmb:ZM,zwe:ZW,xkx:XK';
const A2 = {}, A3 = {};
ISO3.split(',').forEach((x) => { const [a3, a2] = x.split(':'); A2[a3] = a2; A3[a2] = a3; });
const a2of = (a3) => A2[String(a3 || '').toLowerCase()] || null;
const a3of = (a2) => A3[String(a2 || '').toUpperCase()] || null;
const DIMS = { a: ['country', 'device'], p: ['page'], b: ['page', 'country', 'device'] };

// Pure: { s, r } -> [{ country?, device?, page?, c, i, p }]
function decode(set, kind) {
  const dims = DIMS[kind], n = dims.length, out = [];
  if (!set || !Array.isArray(set.r) || !Array.isArray(set.s)) return out;
  for (const r of set.r) {
    const o = { c: r[n], i: r[n + 1], p: r[n + 2] };
    for (let k = 0; k < n; k++) o[dims[k]] = set.s[r[k]];
    out.push(o);
  }
  return out;
}

// Pure: the GSC columns of the ads page.
//   dates (oldest first), days = { date: day blob }, sets = { date: { a, p, b } }, bing = [[date, clicks, impressions]],
//   normPage = the ads page's path normaliser, sum = optional Search Console range summary (used when sets are absent).
// -> { daily: [{ d, gc, gi, gf?, bc?, bi? }], pages: { path: { c, i } }, countries: { A2: { c, i } }, cover }
function joinGsc(dates, days, sets, bing, normPage, sum) {
  const bm = new Map((bing || []).map((r) => [r[0], r]));
  const daily = dates.map((d) => {
    const o = { d };
    const b = days[d];
    if (b && b.t && !(b.f && !b.t[1] && !b.t[0])) { o.gc = b.t[0]; o.gi = b.t[1]; if (b.f) o.gf = 1; }
    const x = bm.get(d);
    if (x) { o.bc = x[1]; o.bi = x[2]; }
    return o;
  });
  const pages = {}, countries = {};
  const add = (m, k, c, i) => { if (!k) return; const o = m[k] || (m[k] = { c: 0, i: 0 }); o.c += c; o.i += i; };
  let pDays = 0, bDays = 0, aDays = 0;
  for (const d of dates) {
    const s = sets[d] || {};
    if (s.p) { pDays++; for (const r of decode(s.p, 'p')) add(pages, normPage(r.page), r.c, r.i); }
    else if (s.b) { bDays++; for (const r of decode(s.b, 'b')) add(pages, normPage(r.page), r.c, r.i); }
    if (s.a) { aDays++; for (const r of decode(s.a, 'a')) add(countries, a2of(r.country) || String(r.country).toUpperCase(), r.c, r.i); }
  }
  let from = 'days';
  if (!pDays && !bDays && !aDays && sum) {
    from = 'summary';
    for (const [k, c, i] of sum.pages || []) add(pages, normPage(k), c, i);
    for (const [k, c, i] of sum.countries || []) add(countries, a2of(k) || String(k).toUpperCase(), c, i);
  }
  return { daily, pages, countries, cover: { from, days: dates.length, pDays, bDays, aDays, sumStart: sum && from === 'summary' ? sum.start : null, sumEnd: sum && from === 'summary' ? sum.end : null } };
}

// Pure: organic clicks / impressions per day for a page and / or a country (cc = alpha-2).
// -> [{ d, oc, oi, of? }] with oc / oi null on days without the needed data; basis says which breakdown was used.
function organicSeries(dates, days, sets, normPage, page, cc) {
  const want3 = cc ? a3of(cc) : null;
  const basis = page && cc ? 'b' : page ? 'p' : cc ? 'a' : 'day';
  const rows = dates.map((d) => {
    const o = { d, oc: null, oi: null };
    const blob = days[d];
    if (blob && blob.f) o.of = 1;
    const s = sets[d] || {};
    let list = null;
    if (basis === 'day') { if (blob && blob.t) { o.oc = blob.t[0]; o.oi = blob.t[1]; } }
    else if (basis === 'a' && s.a) list = decode(s.a, 'a');
    else if (basis === 'p' && (s.p || s.b)) { list = s.p ? decode(s.p, 'p') : decode(s.b, 'b'); if (!s.p) o.ob = 1; }
    else if (basis === 'b' && s.b) list = decode(s.b, 'b');
    if (list) {
      let c = 0, i = 0;
      for (const r of list) {
        if (page && normPage(r.page) !== page) continue;
        if (want3 && String(r.country).toLowerCase() !== want3) continue;
        c += r.c; i += r.i;
      }
      o.oc = c; o.oi = i;
    }
    if (o.of && !o.oi && !o.oc) { o.oc = null; o.oi = null; } // a fresh day with nothing yet is not a drop to 0
    return o;
  });
  return { basis, rows };
}

// Pure: before / after the first day with ad spend, equal-length windows. series rows need { d, spend, oc, oi }.
function beforeAfter(rows) {
  const start = rows.findIndex((r) => r.spend > 0);
  if (start === -1) return { start: null, why: 'no-spend' };
  if (start === 0) return { start: rows[0].d, why: 'spend-from-first-day' };
  const n = Math.min(start, rows.length - start);
  const win = (a, b) => {
    const xs = rows.slice(a, b).filter((r) => r.oi != null);
    const t = { days: xs.length, c: 0, i: 0, spend: 0, adClicks: 0 };
    xs.forEach((r) => { t.c += r.oc; t.i += r.oi; });
    rows.slice(a, b).forEach((r) => { t.spend += r.spend || 0; t.adClicks += r.adClicks || 0; });
    t.cPerDay = t.days ? t.c / t.days : 0; t.iPerDay = t.days ? t.i / t.days : 0;
    return t;
  };
  const before = win(start - n, start), after = win(start, start + n);
  const ch = (a, b) => (a ? (b - a) / a * 100 : null);
  return { start: rows[start].d, n, before, after, clicksChange: ch(before.cPerDay, after.cPerDay), imprChange: ch(before.iPerDay, after.iPerDay) };
}

module.exports = { a2of, a3of, decode, joinGsc, organicSeries, beforeAfter };

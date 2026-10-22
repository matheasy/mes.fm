// Search box + topic chips for the hub list pages (911, hutchison, conspiracy, science, ...). Shared by their build.mjs files
// (the older copies in math/, experiments/, pg/ and livestreams/ predate it and carry their own). Items get `cats` from withCats()
// (a title regex per category, or explicit `item.who` ids from the section file) and an optional `kw` string that is searched too
// (names that are not in the title). A section with `filter: []` gets the search box only.
export const FILTER_CSS = `/* Search box + category chips (same look as the chips on mes.fm/calculators). */
.ls-filter { margin: 0 0 1em; }
.ls-filter input {
  display: block; width: 100%; box-sizing: border-box; font: inherit; font-size: 1.05em;
  padding: 0.65em 0.8em; border: 1px solid #b9c1cc; border-radius: 0.4em; background: #fff; color: #222;
}
.ls-filter input:focus { outline: none; border-color: #277bb6; box-shadow: 0 0 0 2px rgba(39, 123, 182, 0.22); }
.ls-chips { display: flex; flex-wrap: wrap; gap: 0.45em; margin-top: 0.7em; }
.ls-chips button {
  font: inherit; font-size: 0.85em; cursor: pointer; padding: 0.4em 0.9em; border-radius: 1.2em;
  border: 1px solid #c3c9d2; background: #fff; color: #444;
}
.ls-chips button:hover { border-color: #277bb6; color: #277bb6; }
.ls-chips button[aria-pressed="true"] { background: #277bb6; border-color: #277bb6; color: #fff; }
.ls-empty { color: #6a7280; font-style: italic; padding: 0.5em 0 1em; }
.ls-sort { display: inline-block; margin-top: 0.8em; font-size: 0.9em; color: #556; }
.ls-sort select { font: inherit; margin-left: 0.4em; padding: 0.3em 0.5em; border: 1px solid #b9c1cc; border-radius: 0.4em; background: #fff; color: #222; }
.link-card-meta { display: block; font-size: 0.8em; color: #6a7280; }
.list-meta { color: #6a7280; font-size: 0.9em; }
/* long lists (hundreds of videos): let the browser skip painting off-screen cards */
.ls-big .link-card { content-visibility: auto; contain-intrinsic-size: auto 250px; }
.ls-big .list-row { content-visibility: auto; contain-intrinsic-size: auto 64px; }
body.dark-mode .ls-sort { color: #aab; } body.dark-mode .ls-sort select { background: #2a2a2a; color: #eee; border-color: #555; }
body.dark-mode .link-card-meta, body.dark-mode .list-meta { color: #9aa3b2; }
/* a bare [hidden] loses to .link-card { display: flex } etc. */
[data-cats][hidden], .ls-empty[hidden], .ls-filter[hidden] { display: none !important; }

body.dark-mode .ls-filter input { background: #2a2a2a; color: #eee; border-color: #555; }
body.dark-mode .ls-chips button { background: #2a2a2a; color: #ddd; border-color: #555; }
body.dark-mode .ls-chips button:hover { border-color: #6cb6f5; color: #6cb6f5; }
body.dark-mode .ls-chips button[aria-pressed="true"] { background: #6cb6f5; border-color: #6cb6f5; color: #111; }
body.dark-mode .ls-empty { color: #aaa; }
`;

// Client script for the filter (see buildFilter()); String.raw so the regex backslashes survive.
export const FILTER_JS = String.raw`  // Search + category filter (see buildFilter()). Applies to every pane that carries data-cats
  // (Grid, List and Trailers) so the choice survives switching tabs; the chip counts show how many
  // items each chip would give in the pane that is showing. Stats items carry their Q/A's cats
  // too, so the chips filter that tab as well. #<category> in the URL preselects a chip; Esc clears.
  function wireFilter(id) {
    var box = document.getElementById(id + 'Filter');
    var input = document.getElementById(id + 'Search');
    var chips = document.getElementById(id + 'Chips');
    var empty = document.getElementById(id + 'Empty');
    if (!box || !input || !chips) return;
    var panes = ['Grid', 'List', 'Trailers', 'Stats'].map(function (s) { return document.getElementById(id + s); }).filter(Boolean);
    var cat = 'all';

    function items(pane) { return Array.prototype.slice.call(pane.querySelectorAll('[data-cats]')); }
    function titleOf(el) {
      var t = el.querySelector('.link-card-title, h3');
      return ((t ? t.textContent : el.textContent) + ' ' + (el.getAttribute('data-kw') || '')).toLowerCase();
    }
    function inCat(el, c) { return c === 'all' || (' ' + el.getAttribute('data-cats') + ' ').indexOf(' ' + c + ' ') !== -1; }
    function activePane() {
      return panes.filter(function (p) { return !p.classList.contains('view-hidden'); })[0] || null;
    }

    function apply() {
      var words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      panes.forEach(function (pane) {
        items(pane).forEach(function (el) {
          var title = titleOf(el);
          el.hidden = !(inCat(el, cat) && words.every(function (w) { return title.indexOf(w) !== -1; }));
        });
      });
      var pane = activePane();
      box.hidden = !pane;
      if (!pane) { if (empty) empty.hidden = true; return; }
      var els = items(pane);
      Array.prototype.forEach.call(chips.querySelectorAll('button'), function (b) {
        var c = b.getAttribute('data-c');
        var n = els.filter(function (el) { return inCat(el, c); }).length;
        b.textContent = b.getAttribute('data-label') + ' (' + n + ')';
        b.setAttribute('aria-pressed', c === cat ? 'true' : 'false');
      });
      if (empty) empty.hidden = els.some(function (el) { return !el.hidden; });
    }

    // Sort (only when the section has the Sort select): reorders the cards / rows of every pane by their data-i / data-v / data-d.
    var sortSel = document.getElementById(id + 'Sort');
    function num(el, k) { return +el.getAttribute(k) || 0; }
    var SORTS = {
      'new': function (a, b) { return num(a, 'data-i') - num(b, 'data-i'); },
      old: function (a, b) { return num(b, 'data-i') - num(a, 'data-i'); },
      views: function (a, b) { return num(b, 'data-v') - num(a, 'data-v') || num(a, 'data-i') - num(b, 'data-i'); },
      'long': function (a, b) { return num(b, 'data-d') - num(a, 'data-d') || num(a, 'data-i') - num(b, 'data-i'); },
      'short': function (a, b) { return num(a, 'data-d') - num(b, 'data-d') || num(a, 'data-i') - num(b, 'data-i'); },
      az: function (a, b) { var x = titleOf(a), y = titleOf(b); return x < y ? -1 : x > y ? 1 : 0; }
    };
    function reorder() {
      if (!sortSel) return;
      panes.forEach(function (pane) {
        var els = items(pane); if (!els.length || !els[0].hasAttribute('data-i')) return;
        var parent = els[0].parentNode;
        els.sort(SORTS[sortSel.value] || SORTS['new']).forEach(function (el) { parent.appendChild(el); });
      });
    }
    if (sortSel) sortSel.addEventListener('change', reorder);
    function setCat(c) { cat = c; apply(); }
    input.addEventListener('input', apply);
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) setCat(b.getAttribute('data-c'));
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; setCat('all'); }
    });
    // Tab switches (wireViewToggle above runs first): re-count for the newly showing pane.
    Array.prototype.forEach.call(document.querySelectorAll('#' + id + ' .view-toggle-btn'), function (b) {
      b.addEventListener('click', function () { setTimeout(apply, 0); });
    });
    // #<category> preselects a chip, on load and when the hash changes (e.g. a link to
    // /livestreams#hutchison clicked while already on this page).
    function fromHash() {
      var h = (location.hash || '').slice(1);
      if (h && chips.querySelector('button[data-c="' + h + '"]')) cat = h;
    }
    window.addEventListener('hashchange', function () { fromHash(); apply(); });
    fromHash();
    apply();
  }
`;


export function withCats(items, cats) {
  items.forEach((i) => {
    if (i.standalone) return;
    const c = i.who ? i.who.split(" ") : cats.filter((x) => x.test(i.title + " " + (i.kw || ""))).map((x) => x.id);
    i.cats = (c.length ? c : cats.length ? ["other"] : ["all"]).join(" ");
  });
}

// lpHtml (optional): the "Open in:" switch from shared/link-pref.mjs, put at the right end of the chip row.
export function buildFilter(section, escapeHtml, lpHtml = "") {
  const count = (id) => section.items.filter((i) => i.cats !== undefined && (id === "all" || i.cats.split(" ").includes(id))).length;
  const chips = (section.filter.length ? [{ id: "all", label: "All" }, ...section.filter] : [])
    .map((c) => `<button type="button" data-c="${c.id}" data-label="${escapeHtml(c.label)}" aria-pressed="${c.id === "all"}">${escapeHtml(c.label)} (${count(c.id)})</button>`)
    .join("");
  return `<div class="ls-filter" id="${section.id}Filter">
      <input type="search" id="${section.id}Search" placeholder="${escapeHtml(section.filterPlaceholder || "Search\u2026")}" aria-label="Search" autocomplete="off">
      ${lpHtml ? '<div class="lp-row">' : ""}<div class="ls-chips" id="${section.id}Chips">${chips}</div>${lpHtml ? `\n      ${lpHtml}</div>` : ""}${section.sortable ? `
      <label class="ls-sort">Sort by <select id="${section.id}Sort" aria-label="Sort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="views">Most viewed</option><option value="long">Longest</option><option value="short">Shortest</option><option value="az">A to Z</option></select></label>` : ""}
    </div>
    <p class="ls-empty" id="${section.id}Empty" hidden>Nothing matches. Try fewer words or a different filter.</p>`;
}


// "All Content" page (mes.fm/<hub>-all, 2026-10-21): every item of every section the hub writes a page for, on one page with
// the search box and one chip per section (an item listed in two sections gets both chips). Call it right after the PAGES
// array: it appends a section `<hub>-all` to SECTIONS and puts its page first in PAGES (tile = img/<hub>-all-icon.jpg, a copy
// of the hub's own homepage tile). Items are shallow copies, so the section pages' own cats are untouched.
export function addAllPage(SECTIONS, PAGES, { hub, name, iconVersion = 1 }) {
  const pages = PAGES.filter((p) => !p.tileOnly && p.sectionId && SECTIONS.some((s) => s.id === p.sectionId));
  const byKey = new Map();
  const chips = [];
  for (const p of pages) {
    const sec = SECTIONS.find((s) => s.id === p.sectionId);
    const chip = { id: "s-" + sec.id, label: p.tileLabel || sec.title };
    let n = 0;
    for (const item of sec.items) {
      if (item.standalone) continue;
      const key = item.href || (item.links && item.links[0] && item.links[0][1]) || item.title;
      const have = byKey.get(key);
      if (have) { if (!have.cats.split(" ").includes(chip.id)) have.cats += " " + chip.id; n++; continue; }
      byKey.set(key, { ...item, cats: chip.id, kw: [item.kw, chip.label].filter(Boolean).join(" ") });
      n++;
    }
    if (n) chips.push(chip);
  }
  const items = [...byKey.values()];
  SECTIONS.push({ id: `${hub}-all`, title: "All Content", items, filter: chips, filterPlaceholder: `Search everything in ${name}…`, lpAlways: true });
  PAGES.unshift({
    slug: `${hub}-all`,
    sectionId: `${hub}-all`,
    iconVersion,
    tileLabel: "All Content",
    title: `All ${name} Content`,
    description: `Everything in MES ${name} on one page: all ${items.length} posts, videos and articles from every section, searchable, with a filter per section and Grid or List view.`,
  });
}

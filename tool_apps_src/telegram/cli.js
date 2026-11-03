#!/usr/bin/env node
// Helper for update_telegram_archive.py, so the Python fetcher and the page / api share one parser (lib.js).
//   node cli.js parse < page.html            -> {"posts":[...], "before": n}
//   node cli.js write posts.json outdir       -> writes outdir/index.json + outdir/c<k>.json, prints a size summary
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./lib.js');
const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'parse') {
	const html = fs.readFileSync(0, 'utf8');
	process.stdout.write(JSON.stringify(T.parsePage(html)));
} else if (cmd === 'write') {
	const posts = JSON.parse(fs.readFileSync(a1, 'utf8'));
	const out = T.buildData(posts);
	fs.mkdirSync(a2, { recursive: true });
	let total = 0;
	const keep = new Set(['index.json']);
	for (const c of out.chunks) {
		const s = JSON.stringify(c.data);
		fs.writeFileSync(path.join(a2, c.file), s);
		keep.add(c.file); total += s.length;
	}
	for (const f of fs.readdirSync(a2)) if (/^c\d+\.json$/.test(f) && !keep.has(f)) fs.unlinkSync(path.join(a2, f));
	const idx = JSON.stringify(out.index);
	fs.writeFileSync(path.join(a2, 'index.json'), idx);
	total += idx.length;
	process.stdout.write(JSON.stringify({ count: out.index.count, chunks: out.chunks.length, bytes: total, newest: out.index.newest }) + '\n');
} else {
	process.stderr.write('usage: cli.js parse < page.html | cli.js write posts.json outdir\n');
	process.exit(2);
}

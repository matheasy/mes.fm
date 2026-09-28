/* MES Share Launcher -- mes.fm/share
 * Paste one post (title + link, description, hashtags); every social site gets its own text, sized to its limit, with the
 * link where that site wants it (in the post, in a reply, in the description, or "link in bio"). Open copies the main text
 * and opens the site's compose/upload page, pre-filled where the site supports an intent URL. Nothing is posted and nothing
 * leaves the browser: the post, chosen sites, custom Open URLs and Done ticks live in localStorage (per link for ticks).
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("sl");
	if (!root) return;

	/* ---------- storage (may be unavailable) ---------- */
	var store = {
		get: function (k, d) { try { var v = localStorage.getItem("mes-share:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
		set: function (k, v) { try { localStorage.setItem("mes-share:" + k, JSON.stringify(v)); } catch (e) {} }
	};

	/* ---------- text helpers ---------- */
	var seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter() : null;
	function glen(s) { return seg ? Array.from(seg.segment(s)).length : Array.from(s).length; }
	// X counts every URL as 23 characters, however long it is
	function xlen(s) { return glen(s.replace(/https?:\/\/\S+/g, "xxxxxxxxxxxxxxxxxxxxxxx")); }
	// split only where the next sentence starts with a capital/digit, so "i.e. at" and "1.20v" stay whole
	function sentences(s) { return s.replace(/\s*\n+\s*/g, " ").split(/(?<=[.!?])\s+(?=[\p{Lu}\d"“(])/u).map(function (x) { return x.trim(); }).filter(Boolean); }
	function tagWords(t) { return (t.match(/#[\p{L}\p{N}_]+/gu) || []).map(function (x) { return x.slice(1); }); }
	function hashes(t, n) { return tagWords(t).slice(0, n).map(function (w) { return "#" + w; }).join(" "); }
	function plainTags(t, n) { return tagWords(t).slice(0, n).map(function (w) { return w.toLowerCase(); }); }
	function join(parts) { return parts.filter(Boolean).join("\n\n"); }
	var enc = encodeURIComponent;

	// head + as many description sentences as fit + tail, within limit
	function fit(head, desc, tail, limit, len) {
		len = len || glen;
		var body = "", ss = sentences(desc);
		for (var i = 0; i < ss.length; i++) {
			var next = body ? body + " " + ss[i] : ss[i];
			if (len(join([head, next, tail])) > limit) break;
			body = next;
		}
		if (!body && ss.length) {
			var room = limit - len(join([head, "x", tail])) - 2;
			if (room > 40) body = Array.from(ss[0]).slice(0, room).join("").trim() + "…";
		}
		var out = join([head, body, tail]);
		return len(out) > limit ? join([head, tail]) : out;
	}

	/* ---------- parse the pasted post ---------- */
	var VIDEO = /youtu\.?be|3speak\.tv|rumble\.com|odysee\.com|bitchute\.com/i;
	function parse(blob) {
		var urls = [], t = blob.replace(/\r/g, "");
		t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function (m, l, u) { urls.push(u); return l; });  // markdown links
		t = t.replace(/\*\*|__/g, "");
		(t.match(/https?:\/\/[^\s<>"')]+/g) || []).forEach(function (u) { urls.push(u.replace(/[.,;:!?]+$/, "")); });
		var lines = t.split("\n"), first = "";
		for (var i = 0; i < lines.length; i++) if (lines[i].trim()) { first = lines[i].trim(); break; }
		var title = first.replace(/https?:\/\/\S+/g, " ").split(/\s+[-–—|]\s+/)[0].replace(/\s+/g, " ").replace(/[\s:–—|-]+$/, "").trim();
		var rest = t.slice(t.indexOf(first) + first.length);
		var desc = rest.split(/\n\s*\n/).map(function (p) {
			return p.split("\n").filter(function (l) { return !/^\s*https?:\/\/\S+\s*$/.test(l); }).join("\n").trim();
		}).filter(function (p) { return p && !/^(#[\p{L}\p{N}_]+\s*)+$/u.test(p); }).join("\n\n").replace(/(\s#[\p{L}\p{N}_]+)+\s*$/u, "").trim();
		var tags = tagWords(t).map(function (w) { return "#" + w; }).filter(function (w, i, a) { return a.indexOf(w) === i; }).join(" ");
		var link = urls.filter(function (u) { return !VIDEO.test(u); })[0] || urls[0] || "";
		var video = urls.filter(function (u) { return VIDEO.test(u) && u !== link; })[0] || "";
		return { title: title, desc: desc, tags: tags, link: link, video: video };
	}

	function checks(d) {
		var w = [];
		if (!d.link) w.push("No link found: put your page URL on the first line (or in Parsed fields).");
		else {
			var slug = d.link.replace(/[?#].*$/, "").split("/").filter(Boolean).pop() || "";
			var tn = (d.title.match(/\d+/g) || []).slice(0, 2), sn = slug.match(/\d+/g) || [];
			if (tn.length && sn.length && !tn.some(function (n) { return sn.indexOf(n) >= 0; }))
				w.push("The title says " + tn.join("/") + " but the link is “" + slug + "”. Check the title or the link.");
		}
		if (d.title && !d.desc) w.push("No description found (leave a blank line after the title line).");
		return w.join(" ");
	}

	/* ---------- text builders ---------- */
	function lk(d) { return (d.label ? d.label + " " : "") + d.link; }
	function shortPost(d, limit, o) {
		o = o || {};
		return fit(d.title, d.desc, join([o.link ? lk(d) : "", hashes(d.tags, o.tags || 0)]), limit, o.len);
	}
	function uploadDesc(d, n) { return join([d.desc, lk(d), hashes(d.tags, n)]); }
	function blogBody(d) { return join([d.desc, lk(d), d.video]); }
	function inReply(d, limit, tagN, note) { return join([fit(d.title, d.desc, "", limit), note, hashes(d.tags, tagN)]); }
	function hostPath(u) { return u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); }

	/* ---------- the sites ---------- */
	// g: group; open: default page; prefill(d, main): intent URL with text filled in; blocks(d): [label, text, limit?, lenFn?]
	var SITES = [
		// video uploads
		{ id: "youtube", name: "YouTube", g: "video", open: "https://studio.youtube.com/",
			blocks: function (d) { return [["Title", d.title, 100], ["Description", uploadDesc(d, 3), 5000], ["Tags", plainTags(d.tags, 15).join(", "), 500], ["Pinned comment", lk(d)]]; },
			tips: ["Links in the description are clickable.", "The first 3 hashtags in the description show above the title.", "After publishing, post the pinned comment and <b>pin it</b>.", "Add an end screen to a related video."] },
		{ id: "3speak", name: "3Speak", g: "video", open: "https://3speak.tv/",
			blocks: function (d) { return [["Title", d.title], ["Description", uploadDesc(d, 5)], ["Tags", plainTags(d.tags, 8).join(" ")]]; },
			tips: ["Upload video + thumbnail. It becomes a Hive post, so the link is fine.", "First tag is the category."] },
		{ id: "rumble", name: "Rumble", g: "video", open: "https://rumble.com/upload.php",
			blocks: function (d) { return [["Title", d.title], ["Description", uploadDesc(d, 0)], ["Tags", plainTags(d.tags, 10).join(", ")]]; },
			tips: ["Links in the description are fine.", "Pick a category and upload a custom thumbnail."] },
		{ id: "odysee", name: "Odysee", g: "video", open: "https://odysee.com/$/upload",
			blocks: function (d) { return [["Title", d.title], ["Description", uploadDesc(d, 0)], ["Tags", plainTags(d.tags, 5).join(", ")]]; },
			tips: ["Links in the description are fine.", "Tags go in the tag box (about 5)."] },
		{ id: "bitchute", name: "BitChute", g: "video", open: "https://www.bitchute.com/",
			blocks: function (d) { return [["Title", d.title, 100], ["Description", uploadDesc(d, 0)], ["Hashtags", plainTags(d.tags, 5).join(" ")]]; },
			tips: ["Links in the description are fine.", "Set the thumbnail yourself."] },
		{ id: "blurtmedia", name: "Blurt media", g: "video", open: "https://blurt.media/",
			blocks: function (d) { return [["Title", d.title], ["Description", uploadDesc(d, 0)], ["Tags", plainTags(d.tags, 5).join(" ")]]; },
			tips: ["Upload the video; the link in the description is fine."] },
		{ id: "paychute", name: "PayChute", g: "video", open: "https://paychute.com/",
			blocks: function (d) { return [["Title", d.title], ["Description", uploadDesc(d, 0)], ["Tags", plainTags(d.tags, 5).join(", ")]]; },
			tips: ["Upload the video; the link in the description is fine."] },
		{ id: "tiktok", name: "TikTok", g: "video", open: "https://www.tiktok.com/tiktokstudio/upload",
			blocks: function (d) { return [["Caption", join([fit(d.title, d.desc, "", 600), "Link in bio", hashes(d.tags, 5)]), 4000], ["On-screen text", d.link ? hostPath(d.link) : ""]]; },
			tips: ["Links are <b>not clickable</b>: say “link in bio” and check your bio link.", "Vertical 9:16; a 30–90 s clip of a long video works best.", "3–5 hashtags."] },

		// link in the reply / comment
		{ id: "x", name: "X", g: "reply", open: "https://x.com/compose/post",
			prefill: function (d, m) { return "https://x.com/intent/post?text=" + enc(m); },
			blocks: function (d) { return [["Post (no link)", shortPost(d, 280, { tags: 2, len: xlen }), 280, xlen], ["Reply", lk(d), 280, xlen]]; },
			tips: ["Attach the video, <b>no link in the post</b>.", "Right after posting, <b>reply with the link</b>.", "1–2 hashtags."] },
		{ id: "mbs", name: "Meta Business Suite", g: "reply", open: "https://business.facebook.com/latest/composer",
			blocks: function (d) { return [["Post (no link)", inReply(d, 1500, 3, "Link in the first comment 👇")], ["First comment", lk(d)]]; },
			tips: ["Tick both your Facebook Page and Instagram to post to both at once.", "Upload the video natively; <b>link in the first comment</b>."] },
		{ id: "facebook", name: "Facebook", g: "reply", open: "https://www.facebook.com/",
			blocks: function (d) { return [["Post (no link)", inReply(d, 1500, 3, "Link in the first comment 👇")], ["First comment", lk(d)]]; },
			tips: ["Skip if Meta Business Suite already posted it.", "Native video or image, then <b>link in the first comment</b>."] },
		{ id: "instagram", name: "Instagram", g: "reply", open: "https://www.instagram.com/",
			blocks: function (d) { return [["Caption", inReply(d, 1200, 5, "Link in bio"), 2200], ["Story link sticker", d.link]]; },
			tips: ["Links in captions and comments are <b>not clickable</b>: say “link in bio”.", "Share to your Story with a <b>link sticker</b>, the one clickable option.", "About 5 hashtags."] },
		{ id: "linkedin", name: "LinkedIn", g: "reply", open: "https://www.linkedin.com/feed/",
			blocks: function (d) { return [["Post (no link)", inReply(d, 2500, 3, "Link in the first comment 👇"), 3000], ["First comment", lk(d)]]; },
			tips: ["Native video or image does best; <b>link in the first comment</b>.", "3 hashtags at most."] },

		// link right in the post
		{ id: "threads", name: "Threads", g: "link", open: "https://www.threads.com/",
			prefill: function (d, m) { return "https://www.threads.com/intent/post?text=" + enc(m); },
			blocks: function (d) { return [["Post", shortPost(d, 500, { link: true, tags: 1 }), 500]]; },
			tips: ["A link in the post is OK.", "One topic tag per post.", "Attach the video for more reach."] },
		{ id: "bluesky", name: "Bluesky", g: "link", open: "https://bsky.app/",
			prefill: function (d, m) { return "https://bsky.app/intent/compose?text=" + enc(m); },
			blocks: function (d) { return [["Post", shortPost(d, 300, { link: true, tags: 2 }), 300]]; },
			tips: ["Wait for the link card to load before posting.", "300 characters, 1–2 hashtags."] },
		{ id: "substacknote", name: "Substack Note", g: "link", open: "https://substack.com/home",
			blocks: function (d) { return [["Note", join([fit(d.title, d.desc, "", 700), d.link])]]; },
			tips: ["Post as a Note; the link card is fine.", "Attach the thumbnail if no preview appears."] },
		{ id: "ytcommunity", name: "YouTube post", g: "link", open: "https://www.youtube.com/",
			blocks: function (d) { return [["Post", join([fit(d.title, d.desc, "", 600), lk(d), d.video])]]; },
			tips: ["Channel → Posts tab. Post once the video is live; add the video or an image.", "Links are fine in posts."] },
		{ id: "gab", name: "Gab", g: "link", open: "https://gab.com/",
			prefill: function (d, m) { return "https://gab.com/compose?text=" + enc(m); },
			blocks: function (d) { return [["Post", shortPost(d, 3000, { link: true, tags: 3 }), 3000]]; },
			tips: ["A link in the post is fine."] },
		{ id: "minds", name: "Minds", g: "link", open: "https://www.minds.com/newsfeed/subscriptions",
			blocks: function (d) { return [["Post", shortPost(d, 1500, { link: true, tags: 3 }), 1500]]; },
			tips: ["A link in the post is fine."] },
		{ id: "truth", name: "Truth Social", g: "link", open: "https://truthsocial.com/",
			prefill: function (d, m) { return "https://truthsocial.com/share?text=" + enc(m); },
			blocks: function (d) { return [["Post", shortPost(d, 500, { link: true, tags: 2 }), 500]]; },
			tips: ["A link in the post is fine."] },
		{ id: "inleo", name: "InLeo thread", g: "link", open: "https://inleo.io/threads",
			blocks: function (d) { return [["Thread", shortPost(d, 240, { link: true, tags: 2 }), 240]]; },
			tips: ["Hive-based, so the link is fine.", "240 characters."] },
		{ id: "snaps", name: "Snaps (PeakD)", g: "link", open: "https://peakd.com/snaps",
			blocks: function (d) { return [["Snap", shortPost(d, 280, { link: true, tags: 2 }), 280]]; },
			tips: ["Hive-based, so the link is fine. Short and punchy."] },
		{ id: "discord", name: "Discord", g: "link", open: "https://discord.com/channels/@me",
			blocks: function (d) { return [["Message", ["**" + d.title + "**", sentences(d.desc).slice(0, 2).join(" "), lk(d), d.video].filter(Boolean).join("\n"), 2000]]; },
			tips: ["Links unfurl into a preview.", "Use ✎ URL to make Open go straight to your server’s channel."] },
		{ id: "reddit", name: "Reddit", g: "link", open: "https://www.reddit.com/submit",
			prefill: function (d) { return "https://www.reddit.com/submit?url=" + enc(d.link) + "&title=" + enc(d.title); },
			blocks: function (d) { return [["Title", d.title, 300], ["URL", d.link], ["First comment", d.desc]]; },
			tips: ["Pick a subreddit that allows it and read its self-promotion rule.", "Add a comment with context straight away; bare self-links get removed.", "No hashtags."] },
		{ id: "librti", name: "Librti", g: "link", open: "https://librti.com/",
			blocks: function (d) { return [["Post", shortPost(d, 1000, { link: true, tags: 3 })]]; },
			tips: ["A link in the post is fine."] },

		// blog-style
		{ id: "substack", name: "Substack post", g: "blog", open: "https://substack.com/",
			blocks: function (d) { return [["Title", d.title], ["Subtitle", sentences(d.desc)[0] || ""], ["Body", blogBody(d)]]; },
			tips: ["A full post goes to your email subscribers; the Note is the lighter option.", "Paste a YouTube link on its own line to embed it.", "Use ✎ URL for your publication’s dashboard."] },
		{ id: "patreon", name: "Patreon", g: "blog", open: "https://www.patreon.com/home",
			blocks: function (d) { return [["Title", d.title], ["Body", blogBody(d)], ["Tags", plainTags(d.tags, 5).join(", ")]]; },
			tips: ["Make it Public so it helps discovery."] },
		{ id: "subscribestar", name: "SubscribeStar", g: "blog", open: "https://www.subscribestar.com/",
			blocks: function (d) { return [["Post", join([d.title, blogBody(d)])]]; },
			tips: ["Set it to public."] },
		{ id: "blurt", name: "Blurt", g: "blog", open: "https://blurt.blog/submit.html",
			blocks: function (d) { return [["Title", d.title], ["Body (markdown)", blogBody(d)], ["Tags", plainTags(d.tags, 5).join(" ")]]; },
			tips: ["Put the thumbnail image URL at the top of the body for a preview.", "First tag is the category."] },
		{ id: "steemit", name: "Steemit", g: "blog", open: "https://steemit.com/submit.html",
			blocks: function (d) { return [["Title", d.title], ["Body (markdown)", blogBody(d)], ["Tags", plainTags(d.tags, 5).join(" ")]]; },
			tips: ["Up to 5 tags; the first is the category.", "Put the thumbnail image URL at the top of the body."] },

		// image posts
		{ id: "pinterest", name: "Pinterest", g: "image", open: "https://www.pinterest.com/pin-creation-tool/",
			prefill: function (d) { return d.thumb ? "https://www.pinterest.com/pin/create/button/?url=" + enc(d.link) + "&media=" + enc(d.thumb) + "&description=" + enc(d.title) : null; },
			blocks: function (d) { return [["Title", d.title, 100], ["Description", fit("", d.desc, hashes(d.tags, 3), 500), 500], ["Destination link", d.link]]; },
			tips: ["Here the link is <b>the point</b>: always set the destination link.", "Tall 2:3 images do best.", "Add the thumbnail URL in Parsed fields and Open pre-fills the pin."] },
		{ id: "liketu", name: "Liketu", g: "image", open: "https://liketu.net/",
			blocks: function (d) { return [["Title", d.title], ["Text", join([fit("", d.desc, "", 600), lk(d)])], ["Tags", plainTags(d.tags, 8).join(" ")]]; },
			tips: ["Upload the thumbnail as the photo. Hive-based, so links are fine."] },
		{ id: "pixagram", name: "Pixagram", g: "image", open: "https://pixagram.io/",
			blocks: function (d) { return [["Caption", join([d.title, fit("", d.desc, "", 600), lk(d), hashes(d.tags, 5)])]]; },
			tips: ["Upload the thumbnail as the image. Hive-based, so links are fine."] }
	];
	var GROUPS = [
		["video", "Video uploads", "Upload the video itself. Links in the description are fine everywhere except TikTok."],
		["reply", "Link in the reply or first comment", "These feeds show posts with outside links to fewer people: post first, then add the link."],
		["link", "Link right in the post", "No link penalty here."],
		["blog", "Blog-style posts", "Title, body and tags."],
		["image", "Image posts", "Post the thumbnail with a caption."]
	];
	var EXAMPLE = "Problems Plus 5: Launch Angle of 56° maximizes TOTAL distance a projectile travels https://mes.fm/problems-plus-5-projectile-total-distance\n\n" +
		"In this video, I show that firing a projectile has a maximum total distance traveled in the air when the launch angle is approximately 56°. This is 11° higher than the 45° angle needed to maximize the total horizontal distance. I derive this from the arc length integral of the velocity vector, maximized at a critical point. Fascinating stuff!\n\n" +
		"#math #calculus #physics #vectors #projectilemotion";

	/* ---------- state ---------- */
	var F = ["title", "link", "desc", "tags", "video", "thumb"];
	var urls = store.get("urls", {}), hidden = store.get("hidden", {});
	function data() {
		var d = {};
		F.forEach(function (k) { d[k] = $("sl-" + k).value.trim(); });
		d.label = $("sl-label").value.trim();
		return d;
	}
	function doneKey() { return "done:" + (data().link || "nolink"); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function blocksOf(s, d) { return s.blocks(d).filter(function (b) { return b[1]; }); }

	/* ---------- clipboard + toast ---------- */
	var toastT;
	function toast(msg) { var t = $("sl-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1600); }
	function copy(text) {
		if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
		return Promise.resolve(fallback());
		function fallback() {
			var ta = document.createElement("textarea");
			ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
			document.body.appendChild(ta); ta.select();
			var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
			ta.remove(); return ok;
		}
	}

	/* ---------- render ---------- */
	function render() {
		var d = data(), done = store.get(doneKey(), {}), hide = $("sl-hidedone").checked, html = "", shown = 0, nDone = 0;
		$("sl-warn").textContent = checks(d);
		GROUPS.forEach(function (g) {
			var list = SITES.filter(function (s) { return s.g === g[0] && !hidden[s.id]; });
			if (!list.length) return;
			html += '<section class="sl-group"><h2>' + g[1] + "</h2><p>" + g[2] + '</p><div class="sl-cards">';
			list.forEach(function (s) {
				var bl = blocksOf(s, d), isDone = !!done[s.id];
				shown++; if (isDone) nDone++;
				if (isDone && hide) return;
				html += '<div class="sl-card' + (isDone ? " is-done" : "") + '" data-id="' + s.id + '"><div class="sl-head"><b>' + esc(s.name) + "</b>" +
					(s.prefill ? '<span class="sl-badge">pre-fills</span>' : "") + '<span class="sl-sp"></span>' +
					'<label class="sl-done">Done <input type="checkbox" class="sl-tick"' + (isDone ? " checked" : "") + "></label></div>";
				bl.forEach(function (b, i) {
					var n = (b[3] || glen)(b[1]);
					html += '<div class="sl-blk"><div class="sl-bh">' + esc(b[0]) + '<span class="sl-sp"></span><span' + (b[2] && n > b[2] ? ' class="sl-over"' : "") + ">" +
						n + (b[2] ? "/" + b[2] : "") + '</span><button type="button" class="tu-btn tu-btn--ghost sl-copy" data-i="' + i + '">Copy</button></div><pre>' + esc(b[1]) + "</pre></div>";
				});
				html += '<ul class="sl-tips"><li>' + s.tips.join("</li><li>") + "</li></ul>" +
					'<div class="sl-foot"><button type="button" class="tu-btn tu-btn--primary sl-open">' + (bl.length ? "Copy + open" : "Open") + "</button>" +
					'<button type="button" class="tu-btn tu-btn--ghost sl-edit" title="Change where Open goes (saved in this browser)">✎ URL</button></div></div>';
			});
			html += "</div></section>";
		});
		if (!shown) html = '<div class="sl-empty">No sites selected. Use <b>Choose my sites</b>.</div>';
		$("sl-out").innerHTML = html;
		$("sl-progress").textContent = nDone + " / " + shown + " done";
	}
	function renderPicker() {
		$("sl-picker-chips").innerHTML = SITES.map(function (s) {
			return '<button type="button" class="tu-chip" data-id="' + s.id + '" aria-pressed="' + !hidden[s.id] + '">' + esc(s.name) + "</button>";
		}).join("");
	}

	/* ---------- events ---------- */
	$("sl-out").addEventListener("click", function (e) {
		var card = e.target.closest(".sl-card"); if (!card) return;
		var s = SITES.filter(function (x) { return x.id === card.dataset.id; })[0], d = data(), bl = blocksOf(s, d), btn = e.target.closest("button");
		if (!btn) return;
		if (btn.classList.contains("sl-copy")) {
			copy(bl[+btn.dataset.i][1]).then(function (ok) { toast(ok ? "Copied" : "Copy failed: select the text instead"); });
		} else if (btn.classList.contains("sl-open")) {
			var main = bl[0] ? bl[0][1] : "";
			var url = urls[s.id] || (s.prefill && s.prefill(d, main)) || s.open;
			window.open(url, "_blank", "noopener");  // open first, inside the click, so pop-up blockers allow it
			if (main) copy(main).then(function (ok) { toast(ok ? "Copied “" + bl[0][0] + "”, paste it in" : "Opened"); });
		} else if (btn.classList.contains("sl-edit")) {
			var v = prompt("Where should Open go for " + s.name + "?\n(Empty = back to the default" + (s.prefill ? ", which pre-fills the post" : "") + ".)", urls[s.id] || s.open);
			if (v === null) return;
			if (v.trim() && v.trim() !== s.open) urls[s.id] = v.trim(); else delete urls[s.id];
			store.set("urls", urls);
			toast("Saved");
		}
	});
	$("sl-out").addEventListener("change", function (e) {
		if (!e.target.classList.contains("sl-tick")) return;
		var id = e.target.closest(".sl-card").dataset.id, done = store.get(doneKey(), {});
		if (e.target.checked) done[id] = 1; else delete done[id];
		store.set(doneKey(), done); render();
	});
	$("sl-picker-chips").addEventListener("click", function (e) {
		var b = e.target.closest(".tu-chip"); if (!b) return;
		var id = b.dataset.id;
		if (hidden[id]) delete hidden[id]; else hidden[id] = 1;
		store.set("hidden", hidden); renderPicker(); render();
	});
	$("sl-all").onclick = function () { hidden = {}; store.set("hidden", hidden); renderPicker(); render(); };
	$("sl-none").onclick = function () { SITES.forEach(function (s) { hidden[s.id] = 1; }); store.set("hidden", hidden); renderPicker(); render(); };
	$("sl-pick").onclick = function () { var p = $("sl-picker"); p.hidden = !p.hidden; if (!p.hidden) renderPicker(); };
	$("sl-untick").onclick = function () { store.set(doneKey(), {}); render(); };
	$("sl-hidedone").onchange = function () { store.set("hidedone", this.checked); render(); };

	function fill(p) { F.forEach(function (k) { if (k in p) $("sl-" + k).value = p[k]; }); }
	function save() { var d = data(); d.blob = $("sl-blob").value; store.set("post", d); store.set("label", d.label); }
	function fromBlob() {
		var p = parse($("sl-blob").value), keep = data();
		if (!p.link) p.link = keep.link;
		if (!p.video) p.video = keep.video;
		fill(p); save(); render();
	}
	$("sl-blob").addEventListener("input", fromBlob);
	F.concat("label").forEach(function (k) { $("sl-" + k).addEventListener("input", function () { save(); render(); }); });
	$("sl-example").onclick = function () { $("sl-blob").value = EXAMPLE; F.forEach(function (k) { $("sl-" + k).value = ""; }); fromBlob(); };
	$("sl-clear").onclick = function () { $("sl-blob").value = ""; F.forEach(function (k) { $("sl-" + k).value = ""; }); save(); render(); $("sl-blob").focus(); };

	var saved = store.get("post", null);
	if (saved) { $("sl-blob").value = saved.blob || ""; fill(saved); }
	$("sl-label").value = store.get("label", "🔗 Full post:");
	$("sl-hidedone").checked = store.get("hidedone", false);
	render();
})();

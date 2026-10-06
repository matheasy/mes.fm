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
	// same, but splits a TitleCase hashtag into words -- "#ProjectileMotion" -> "projectile motion" -- for
	// sites whose tag/keyword field takes proper phrases (a lowercase hashtag like "#projectilemotion" has
	// no case boundary to split on, so write multi-word hashtags in TitleCase to get this)
	function spacedTags(t, n) { return tagWords(t).slice(0, n).map(function (w) { return w.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase(); }); }
	function join(parts) { return parts.filter(Boolean).join("\n\n"); }
	// Odysee's own auto-slug: sanitize punctuation, spaces to dashes, word casing kept as typed
	function slugify(t) { return (t || "").replace(/[^\p{L}\p{N}\s-]+/gu, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-"); }
	var enc = encodeURIComponent;

	// head + as many complete description sentences as fit + tail, within limit.
	// Never cuts a sentence mid-way (the old fallback sliced the first sentence
	// to fit, e.g. "...when the laun..." -- jarring and unreadable). Instead,
	// a graceful chain: complete sentences with the head, then without it (the
	// title is the more expendable of the two on a tight limit), then the head
	// alone, then just the tail.
	function fit(head, desc, tail, limit, len) {
		len = len || glen;
		var ss = sentences(desc);
		function build(h) {
			var body = "";
			for (var i = 0; i < ss.length; i++) {
				var next = body ? body + " " + ss[i] : ss[i];
				if (len(join([h, next, tail])) > limit) break;
				body = next;
			}
			return body;
		}
		var body = build(head);
		if (body) return join([head, body, tail]);
		body = build("");
		if (body) return join([body, tail]);
		if (len(join([head, tail])) <= limit) return join([head, tail]);
		return tail || "";
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
		return { title: title, desc: desc, tags: tags, link: link, video: video, slug: slugify(title) };
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
	function lk(d, noTz) { return (d.label ? d.label + " " : "") + d.link + (d.tz && !noTz ? "\n🌐 Your time zone: " + d.tz : ""); }
	function shortPost(d, limit, o) {
		o = o || {};
		// the time zone link costs ~90 characters: only worth it where the limit is roomy (not Snaps, Bluesky, Threads, Truth Social)
		return fit(d.title, d.desc, join([o.link ? lk(d, limit < 1000) : "", hashes(d.tags, o.tags || 0)]), limit, o.len);
	}
	function uploadDesc(d, n) { return join([d.desc, lk(d), hashes(d.tags, n)]); }
	function blogBody(d) { return join([d.desc, lk(d), d.video]); }
	// note + hashtags go in fit()'s own tail slot, not appended after it, so the
	// description-fitting budget actually reserves room for them within `limit`
	// (appending them afterward -- the old bug -- let the total run over `limit`,
	// worst on a tight cap like InLeo's 240: consistently ~10% over)
	function inReply(d, limit, tagN, note) { return fit(d.title, d.desc, join([note, hashes(d.tags, tagN)]), limit); }
	function hostPath(u) { return u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); }
	// a small bullet-list comment to paste under the upload once it's live: "- Notes: <link>" then any
	// extra reference links typed in Parsed fields, one per line, each becoming its own "- " bullet
	function refComment(d) {
		var lines = [];
		if (d.link) lines.push("Notes: " + d.link);
		(d.links || "").split("\n").forEach(function (l) { l = l.trim(); if (l) lines.push(l); });
		return lines.map(function (l) { return "- " + l; }).join("\n");
	}

	/* ---------- the sites ---------- */
	// g: group; open: default page; prefill(d, main): intent URL with text filled in; blocks(d): [label, text, limit?, lenFn?]
	var SITES = [
		// video uploads
		{ id: "youtube", name: "YouTube", g: "video", open: "https://studio.youtube.com/",
			blocks: function (d) { return [["Title", d.title, 100], ["Description", uploadDesc(d, 3), 5000], ["Tags", plainTags(d.tags, 15).join(", "), 500], ["Pinned comment", lk(d)]]; },
			tips: ["Links in the description are clickable.", "The first 3 hashtags in the description show above the title.", "After publishing, post the pinned comment and <b>pin it</b>.", "Add an end screen to a related video."] },
		{ id: "3speak", name: "3Speak", g: "video", open: "https://3speak.tv/",
			blocks: function (d) { return [["Title", d.title], ["Description", uploadDesc(d, 5)], ["Tags", plainTags(d.tags, 8).join(" ")], ["Comment", refComment(d)]]; },
			tips: ["Upload video + thumbnail. It becomes a Hive post, so the link is fine.", "First tag is the category.", "Post the comment after publishing and pin it if you can."] },
		{ id: "rumble", name: "Rumble", g: "video", open: "https://rumble.com/upload.php",
			blocks: function (d) { return [["Title", d.title], ["Description", uploadDesc(d, 0)], ["Tags", plainTags(d.tags, 10).join(", ")], ["Comment", refComment(d)]]; },
			tips: ["Links in the description are fine.", "Pick a category and upload a custom thumbnail.", "Post the comment after publishing and pin it."] },
		{ id: "odysee", name: "Odysee", g: "video", open: "https://odysee.com/$/upload",
			blocks: function (d) { return [["Title", d.title], ["URL slug", d.slug || slugify(d.title)], ["Description", uploadDesc(d, 0)], ["Tags", spacedTags(d.tags, 5).join(", ")], ["Comment", refComment(d)]]; },
			tips: ["Links in the description are fine.", "Paste the URL slug into the box under Title — odysee.com/@you/&lt;slug&gt;. Shorten it if you like; Odysee just needs it unique.", "Tags go in the tag box (about 5) — proper phrases are fine, e.g. “projectile motion”.", "Post the comment after publishing and pin it."] },
		{ id: "bitchute", name: "BitChute", g: "video", open: "https://www.bitchute.com/",
			blocks: function (d) { return [["Title", d.title, 100], ["Description", uploadDesc(d, 0)], ["Search terms", plainTags(d.tags, 3).join(" ")], ["Comment", refComment(d)]]; },
			tips: ["Links in the description are fine.", "Search Terms box: max 3, space-separated.", "Set the thumbnail yourself.", "Post the comment after publishing and pin it."] },
		{ id: "blurtmedia", name: "Blurt media", g: "video", open: "https://blurt.media/",
			blocks: function (d) { return [["Title", d.title], ["Description", uploadDesc(d, 0)], ["Tags", plainTags(d.tags, 5).join(" ")], ["Comment", refComment(d)]]; },
			tips: ["Upload the video; the link in the description is fine.", "Post the comment after publishing."] },
		{ id: "paychute", name: "PayChute", g: "video", open: "https://paychute.com/",
			blocks: function (d) { return [["Title", d.title], ["Description", uploadDesc(d, 0)], ["Tags", spacedTags(d.tags, 5).join(", ")], ["Comment", refComment(d)]]; },
			tips: ["Upload the video; the link in the description is fine.", "Tags take proper phrases, e.g. “projectile motion”.", "Post the comment after publishing."] },
		{ id: "fbreels", name: "Facebook Reels", g: "video", open: "https://www.facebook.com/reels/create/",
			blocks: function (d) { return [["Caption", inReply(d, 2200, 5, "Link in the first comment 👇")], ["Tags (keywords)", spacedTags(d.tags, 8).join(", ")], ["Comment", refComment(d)]]; },
			tips: ["Upload the video alone — attaching a photo turns the post into a carousel and it loses Reels-specific distribution.", "Links aren't clickable in the caption; post the <b>Comment</b> block (with the link) as the first comment.", "Fill in the Tags box — Facebook says it's how people find your reel. Proper phrases are fine, e.g. “projectile motion”."] },
		{ id: "tiktok", name: "TikTok", g: "video", open: "https://www.tiktok.com/tiktokstudio/upload",
			blocks: function (d) { return [["Caption", join([fit(d.title, d.desc, "", 600), "Link in bio", hashes(d.tags, 5)]), 4000], ["On-screen text", d.link ? hostPath(d.link) : ""]]; },
			tips: ["Links are <b>not clickable</b>: say “link in bio” and check your bio link.", "Vertical 9:16; a 30–90 s clip of a long video works best.", "3–5 hashtags."] },

		// link in the reply / comment
		{ id: "x", name: "X", g: "reply", open: "https://x.com/compose/post",
			prefill: function (d, m) { return "https://x.com/intent/post?text=" + enc(m); },
			blocks: function (d) {
				// X Premium raises the post limit to 25,000 characters, so the whole description fits; the reply stays a short link
				var limit = xPremium ? 25000 : 280;
				return [["Post (no link)", shortPost(d, limit, { tags: 2, len: xlen }), limit, xlen], ["Reply", lk(d), 280, xlen]];
			},
			tips: ["Attach the video, <b>no link in the post</b>.", "280 characters, unless you tick X Premium above (25,000). Long posts collapse after about 280 characters behind “Show more”, so the title has to carry the hook.", "X lets you attach the thumbnail alongside the video in the same post — worth doing when it carries real content of its own, like a full derivation.", "Right after posting, <b>reply with the link</b>.", "1–2 hashtags."] },
		{ id: "mbs", name: "Meta Business Suite", g: "reply", open: "https://business.facebook.com/latest/composer",
			blocks: function (d) { return [["Post (no link)", inReply(d, 1500, 3, "Link in the first comment 👇")], ["First comment", lk(d)]]; },
			tips: ["Tick both your Facebook Page and Instagram to post to both at once.", "Upload the video natively; <b>link in the first comment</b>.", "Attaching a photo alongside it turns the post into a carousel, which Facebook's Reels-specific feed doesn't count the same as a video-only post — fine for a landscape/long-form video, worth keeping the video solo for a short vertical clip you want in the Reels feed."] },
		{ id: "facebook", name: "Facebook", g: "reply", open: "https://www.facebook.com/",
			blocks: function (d) { return [["Post (no link)", inReply(d, 1500, 3, "Link in the first comment 👇")], ["First comment", lk(d)]]; },
			tips: ["Skip if Meta Business Suite already posted it.", "Native video or image, then <b>link in the first comment</b>.", "Same Reels-vs-carousel tradeoff as Meta Business Suite if you're combining the video with a photo."] },
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
		{ id: "ytcommunity", name: "YouTube Community Post", g: "link", open: "https://www.youtube.com/",
			blocks: function (d) { return [["Post", join([fit(d.title, d.desc, "", 600), lk(d), d.video])]]; },
			tips: ["YouTube Studio → Posts tab (Community). Post once the video is live; add the video or an image.", "Links are fine in posts."] },
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
		{ id: "inleo", name: "InLeo thread", g: "reply", open: "https://inleo.io/threads",
			blocks: function (d) {
				var limit = inleoPremium ? 20000 : 240;
				var thread = inReply(d, limit, 2, "Link in a reply thread 👇");
				return [["Thread (no link)", thread].concat(inleoPremium ? [] : [240]), ["Reply thread", lk(d)]];
			},
			tips: ["Hive-based, but InLeo's own composer warns against a link in the top-level thread: “please post the top-level thread and then make a reply thread to it with the link.”", "240 characters, unless you tick InLeo Premium above — Premium removes the cap."] },
		{ id: "snaps", name: "Snaps (PeakD)", g: "link", open: "https://peakd.com/snaps",
			blocks: function (d) { return [["Snap", shortPost(d, 280, { link: true, tags: 2 }), 280]]; },
			tips: ["Hive-based, so the link is fine. Short and punchy."] },
		{ id: "pixagramcom", name: "Pixagram community", g: "link", open: "https://pixagram.com/portal-112893/created/",
			blocks: function (d) { return [["Post", shortPost(d, 1000, { link: true, tags: 5 })]]; },
			tips: ["Your community page on Pixagram, a Hive-based network, so the link in the post is fine.", "Attach the thumbnail (or the trailer) as the media.", "Use ✎ URL if Open should go somewhere else."] },
		{ id: "patreonquip", name: "Patreon Quip", g: "link", open: "https://www.patreon.com/home",
			blocks: function (d) { return [["Quip", shortPost(d, 500, { link: true, tags: 2 })]]; },
			tips: ["Quips are Patreon's short public posts, shown in the Home feed to your patrons and to people who don't know you yet. Click the <b>+</b> in the left bar, then <b>Quip</b>.", "Quips are always public. Text only, short: after about nine lines readers see “read more”.", "Add the thumbnail, a trailer clip or an image.", "Patreon doesn't say how links in Quips are treated, so check yours shows as a clickable link."] },
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
			blocks: function (d) { return [["Title", d.title], ["Body", blogBody(d)], ["Tags", spacedTags(d.tags, 5).join(", ")]]; },
			tips: ["Make it Public so it helps discovery.", "Tags take proper phrases, e.g. “projectile motion”."] },
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
		{ id: "pixagram", name: "Pixagram", g: "image", open: "https://pixagram.com/",
			blocks: function (d) { return [["Caption", join([d.title, fit("", d.desc, "", 600), lk(d), hashes(d.tags, 5)])]]; },
			tips: ["Upload the thumbnail as the image. Hive-based, so links are fine."] },
		{ id: "tiktokphoto", name: "TikTok Photo", g: "image", open: "https://www.tiktok.com/tiktokstudio/upload",
			blocks: function (d) { return [["Caption", join([fit(d.title, d.desc, "", 600), "Link in bio", hashes(d.tags, 5)]), 4000]]; },
			tips: ["TikTok Studio's upload now offers Photos as well as Video — good for posting a standalone derivation image on its own.", "Same composer as the video upload; pick Photos instead of Video.", "Links are <b>not clickable</b>: say “link in bio” and check your bio link.", "3–5 hashtags."] }
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
		"#math #calculus #physics #vectors #ProjectileMotion";

	/* ---------- state ---------- */
	var F = ["title", "link", "desc", "tags", "video", "thumb", "slug", "links"];
	var urls = store.get("urls", {}), hidden = store.get("hidden", {});
	var searchQuery = "";  // not persisted -- a fresh search each visit, unlike hidden/urls
	var inleoPremium = store.get("inleoPremium", false);  // removes InLeo's 240-char thread cap
	var xPremium = store.get("xPremium", false);  // X Premium: 25,000-character posts instead of 280
	function data() {
		var d = {};
		F.forEach(function (k) { d[k] = $("sl-" + k).value.trim(); });
		d.label = $("sl-label").value.trim();
		d.sdate = $("sl-sdate").value; d.stime = $("sl-stime").value; d.szone = $("sl-szone").value.trim();
		return d;
	}

	/* ---------- livestream switch ---------- */
	// post = the normal video/replay flow; announce = before the stream (trailer + time + live-page link); live = one short "LIVE now" post.
	var live = store.get("live", {}), mode = ["post", "announce", "live"].indexOf(live.mode) >= 0 ? live.mode : "post", asset = live.asset === "thumb" ? "thumb" : "trailer";
	var MODE_NOTE = {
		post: "",
		announce: "Upload the trailer as a native video (add the thumbnail as a second image where the site allows it). The link goes in the first comment or reply, with a time zone link so people can see your start time in their own zone.",
		live: "One short post with the thumbnail and a single line. Upload, blog-style (except Patreon) and image sites are hidden: the stream would be over before anyone saw it there."
	};
	// sites that make no sense for the mode (the stream itself is the video; slow sites miss a live post)
	var STREAM_HIDE = ["youtube", "3speak", "rumble", "odysee", "bitchute", "blurtmedia", "paychute"];
	var LIVE_HIDE = STREAM_HIDE.concat(["fbreels", "tiktok", "substacknote", "pinterest", "liketu", "pixagram", "tiktokphoto"]);
	function modeHides(id, g) {
		if (mode === "announce") {
			if (STREAM_HIDE.indexOf(id) >= 0 || (g === "blog" && id !== "patreon")) return true;
			// the trailer is a video, the thumbnail an image: each goes only where it belongs
			return asset === "thumb" ? (id === "fbreels" || id === "tiktok") : g === "image";
		}
		if (mode === "live") return LIVE_HIDE.indexOf(id) >= 0 || (g === "blog" && id !== "patreon");
		return false;
	}
	function zoneOk(z) { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return !!z; } catch (e) { return false; } }
	function defaultZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; } }
	function zoneParts(z, ts) {
		var o = {};
		new Intl.DateTimeFormat("en-US", { timeZone: z, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
			.formatToParts(new Date(ts)).forEach(function (p) { o[p.type] = +p.value; });
		return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - ts;  // zone offset from UTC in ms
	}
	// "Sat, Oct 4, 6:00 PM PDT (01:00 UTC)" for a wall-clock date + time in an IANA zone; null if incomplete
	function whenText(date, time, zone) {
		var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^(\d{1,2}):(\d{2})$/.exec(time);
		if (!m || !t || !zoneOk(zone)) return null;
		var wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
		var ts = wall - zoneParts(zone, wall); ts = wall - zoneParts(zone, ts);  // second pass settles DST edges
		var day = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(wall));
		var clock = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(ts));
		var utc = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ts));
		return { text: day + ", " + clock + (/UTC|GMT/.test(clock) ? "" : " (" + utc + " UTC)"), ts: ts };
	}
	function tzLink(date, time, zone) {
		return "https://mes.fm/timezone#t=" + enc(time) + "&d=" + enc(date) + "&f=" + enc(zone);
	}
	// the post as the current mode words it
	function modeData(d) {
		if (mode === "post") return d;
		var o = {}, k;
		for (k in d) o[k] = d[k];
		var tags = d.tags.indexOf("#livestream") < 0 && !/#livestream\b/i.test(d.tags) ? ("#livestream " + d.tags).trim() : d.tags;
		o.tags = tags;
		if (mode === "live") {
			o.title = "🔴 LIVE NOW: " + d.title;
			o.desc = sentences(d.desc).slice(0, 1).join(" ");
			o.label = "🔴 Watch live:";
			return o;
		}
		o.title = "📅 Livestream: " + d.title;
		o.label = "🔔 Set a reminder:";
		var w = whenText(d.sdate, d.stime, d.szone || defaultZone());
		if (w) {
			o.desc = ("🕒 " + w.text + ". " + d.desc).trim();
			o.tz = tzLink(d.sdate, d.stime, d.szone || defaultZone());
		}
		return o;
	}
	function cur() { return modeData(data()); }
	function modeKey() { return mode === "post" ? "" : ":" + mode + (mode === "announce" && asset === "thumb" ? ":thumb" : ""); }
	function doneKey() { return "done:" + (data().link || "nolink") + modeKey(); }
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
	// Folding: a group (section) fold is a layout preference, kept across posts; a card fold is per link like the Done ticks.
	// A card with no explicit fold follows its Done tick (ticking Done folds it), so a finished site shrinks to one line.
	function foldKey() { return "fold:" + (data().link || "nolink") + modeKey(); }
	var gfold = store.get("gfold", {});
	function cardFolded(fold, done, id) { return id in fold ? !!fold[id] : !!done[id]; }
	function render() {
		var d = cur(), done = store.get(doneKey(), {}), fold = store.get(foldKey(), {}), hide = $("sl-hidedone").checked;
		var html = "", shown = 0, nDone = 0, anyOpen = false;
		$("sl-warn").textContent = checks(data()) + (mode === "announce" && !whenText(d.sdate, d.stime, d.szone || defaultZone()) ? " Set the stream date, time and a valid time zone so the posts include when it starts." : "");
		GROUPS.forEach(function (g) {
			var list = SITES.filter(function (s) {
				return s.g === g[0] && !hidden[s.id] && !modeHides(s.id, s.g) &&
					(!searchQuery || s.name.toLowerCase().indexOf(searchQuery) !== -1);
			});
			if (!list.length) return;
			var gDone = list.filter(function (s) { return done[s.id]; }).length, gf = !!gfold[g[0]];
			html += '<section class="sl-group' + (gf ? " is-folded" : "") + (gDone === list.length ? " is-done" : "") + '" data-g="' + g[0] + '">' +
				'<h2 class="sl-gh"><button type="button" class="sl-gtoggle" aria-expanded="' + !gf + '"><span class="sl-arrow" aria-hidden="true">▼</span>' + g[1] +
				'<span class="sl-gcount">' + (gDone ? "✓ " : "") + gDone + "/" + list.length + " done</span></button></h2>" +
				'<div class="sl-gbody"><p>' + g[2] + '</p><div class="sl-cards">';
			list.forEach(function (s) {
				var bl = blocksOf(s, d), isDone = !!done[s.id], cf = cardFolded(fold, done, s.id);
				shown++; if (isDone) nDone++;
				if (isDone && hide) return;
				if (!gf && !cf) anyOpen = true;
				html += '<div class="sl-card' + (isDone ? " is-done" : "") + (cf ? " is-folded" : "") + '" data-id="' + s.id + '"><div class="sl-head">' +
					'<button type="button" class="sl-toggle" aria-expanded="' + !cf + '"><span class="sl-arrow" aria-hidden="true">▼</span>' +
					(isDone ? '<span class="sl-check-mark" aria-label="done">✓</span>' : "") + "<b>" + esc(s.name) + "</b></button>" +
					(s.prefill ? '<span class="sl-badge">pre-fills</span>' : "") + '<span class="sl-sp"></span>' +
					'<label class="sl-done">Done <input type="checkbox" class="sl-tick"' + (isDone ? " checked" : "") + '></label></div><div class="sl-body">' +
					(s.id === "x" ? '<label class="sl-done" style="margin:0 0 0.6em;"><input type="checkbox" class="sl-x-premium"' +
						(xPremium ? " checked" : "") + '> X Premium (long posts, 25,000 chars)</label>' : "") +
					(s.id === "inleo" ? '<label class="sl-done" style="margin:0 0 0.6em;"><input type="checkbox" class="sl-inleo-premium"' +
						(inleoPremium ? " checked" : "") + '> InLeo Premium (no 240-char cap)</label>' : "");
				bl.forEach(function (b, i) {
					var n = (b[3] || glen)(b[1]);
					html += '<div class="sl-blk"><div class="sl-bh">' + esc(b[0]) + '<span class="sl-sp"></span><span' + (b[2] && n > b[2] ? ' class="sl-over"' : "") + ">" +
						n + (b[2] ? "/" + b[2] : "") + '</span><button type="button" class="tu-btn tu-btn--ghost sl-copy" data-i="' + i + '">Copy</button></div><pre>' + esc(b[1]) + "</pre></div>";
				});
				html += '<ul class="sl-tips"><li>' + s.tips.join("</li><li>") + "</li></ul>" +
					'<div class="sl-foot"><button type="button" class="tu-btn tu-btn--primary sl-open">' + (bl.length ? "Copy + open" : "Open") + "</button>" +
					'<button type="button" class="tu-btn tu-btn--ghost sl-edit" title="Change where Open goes (saved in this browser)">✎ URL</button></div></div></div>';
			});
			html += "</div></div></section>";
		});
		if (!shown) html = '<div class="sl-empty">No sites selected. Use <b>Choose my sites</b>.</div>';
		$("sl-out").innerHTML = html;
		$("sl-progress").textContent = nDone + " / " + shown + " done";
		$("sl-foldall").textContent = anyOpen ? "Collapse all" : "Expand all";
	}
	function renderPicker() {
		$("sl-picker-chips").innerHTML = SITES.map(function (s) {
			return '<button type="button" class="tu-chip" data-id="' + s.id + '" aria-pressed="' + !hidden[s.id] + '">' + esc(s.name) + "</button>";
		}).join("");
	}

	/* ---------- events ---------- */
	$("sl-out").addEventListener("click", function (e) {
		var gt = e.target.closest(".sl-gtoggle");
		if (gt) {
			var g = gt.closest(".sl-group").dataset.g;
			if (gfold[g]) delete gfold[g]; else gfold[g] = 1;
			store.set("gfold", gfold); render(); return;
		}
		var card = e.target.closest(".sl-card"); if (!card) return;
		if (e.target.closest(".sl-toggle")) {
			var fold = store.get(foldKey(), {}), id = card.dataset.id;
			fold[id] = !card.classList.contains("is-folded");
			store.set(foldKey(), fold); render(); return;
		}
		var s = SITES.filter(function (x) { return x.id === card.dataset.id; })[0], d = cur(), bl = blocksOf(s, d), btn = e.target.closest("button");
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
		if (e.target.classList.contains("sl-x-premium")) {
			xPremium = e.target.checked;
			store.set("xPremium", xPremium);
			render();
			return;
		}
		if (e.target.classList.contains("sl-inleo-premium")) {
			inleoPremium = e.target.checked;
			store.set("inleoPremium", inleoPremium);
			render();
			return;
		}
		if (!e.target.classList.contains("sl-tick")) return;
		var id = e.target.closest(".sl-card").dataset.id, done = store.get(doneKey(), {});
		if (e.target.checked) done[id] = 1; else delete done[id];
		var fold = store.get(foldKey(), {}); delete fold[id]; store.set(foldKey(), fold);
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
	$("sl-untick").onclick = function () { store.set(doneKey(), {}); store.set(foldKey(), {}); render(); };
	// Collapse all folds every card (one line per site, Done ticks still showing); Expand all opens every card and section
	$("sl-foldall").onclick = function () {
		var collapse = this.textContent === "Collapse all", fold = {};
		SITES.forEach(function (x) { fold[x.id] = collapse; });
		if (!collapse) { gfold = {}; store.set("gfold", gfold); }
		store.set(foldKey(), fold); render();
	};
	$("sl-hidedone").onchange = function () { store.set("hidedone", this.checked); render(); };
	$("sl-search").addEventListener("input", function () { searchQuery = this.value.trim().toLowerCase(); render(); });

	function fill(p) { F.forEach(function (k) { if (k in p) $("sl-" + k).value = p[k]; }); }
	function save() { var d = data(); d.blob = $("sl-blob").value; store.set("post", d); store.set("label", d.label); }
	function saveLive() { store.set("live", { mode: mode, asset: asset, sdate: $("sl-sdate").value, stime: $("sl-stime").value, szone: $("sl-szone").value.trim() }); }
	function syncMode() {
		Array.prototype.forEach.call($("sl-modes").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === mode)); });
		$("sl-live").hidden = mode !== "announce";
		Array.prototype.forEach.call($("sl-asset").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.a === asset)); });
		$("sl-mode-note").textContent = mode === "announce" ? (asset === "thumb"
			? "Post the thumbnail as its own image post (Pinterest, YouTube Community, Instagram, Facebook...). The video-only cards (Reels, TikTok) are hidden. Space it a few hours or a day from the trailer post."
			: "Post the trailer as its own native video (add no photo, so it is not turned into a carousel). Image sites are hidden. The link goes in the first comment or reply, with a time zone link so people can see your start time in their own zone.") : MODE_NOTE[mode];
		var w = whenText($("sl-sdate").value, $("sl-stime").value, $("sl-szone").value.trim() || defaultZone());
		$("sl-when").textContent = w ? "Posts will say: " + w.text : "Pick a date and time; your own time zone is used unless you change it.";
	}
	$("sl-asset").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		asset = b.dataset.a; saveLive(); syncMode(); render();
	});
	$("sl-modes").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		mode = b.dataset.m; saveLive(); syncMode(); render();
	});
	["sdate", "stime", "szone"].forEach(function (k) { $("sl-" + k).addEventListener("input", function () { saveLive(); syncMode(); render(); }); });
	function fromBlob() {
		var p = parse($("sl-blob").value), keep = data();
		if (!p.link) p.link = keep.link;
		if (!p.video) p.video = keep.video;
		// slug auto-follows the title until hand-edited away from its own auto value
		if (keep.slug && keep.slug !== slugify(keep.title)) p.slug = keep.slug;
		fill(p); save(); render();
	}
	$("sl-blob").addEventListener("input", fromBlob);
	F.concat("label").forEach(function (k) { $("sl-" + k).addEventListener("input", function () { save(); render(); }); });
	$("sl-example").onclick = function () { $("sl-blob").value = EXAMPLE; F.forEach(function (k) { $("sl-" + k).value = ""; }); fromBlob(); };
	$("sl-clear").onclick = function () { $("sl-blob").value = ""; F.forEach(function (k) { $("sl-" + k).value = ""; }); save(); render(); $("sl-blob").focus(); };

	/* ---------- my own text: user snippets with their own Copy buttons (localStorage mes-share:snippets) ---------- */
	var snips = store.get("snippets", []);
	if (!Array.isArray(snips)) snips = [];
	function saveSnips() { store.set("snippets", snips); }
	function renderSnips() {
		var box = $("sl-snip-list");
		box.innerHTML = snips.map(function (s, i) {
			return '<div class="sl-snip" data-i="' + i + '"><div class="sl-snip-h"><input class="tu-input sl-snip-label" type="text" maxlength="60" placeholder="Name (e.g. Sign-off)" aria-label="Snippet name" value="' + esc(s.label || "") + '">' +
				'<button type="button" class="tu-btn tu-btn--primary sl-snip-copy">Copy</button><button type="button" class="tu-btn tu-btn--ghost sl-snip-del" title="Delete this text" aria-label="Delete this text">✕</button></div>' +
				'<textarea class="tu-input sl-snip-text" rows="3" spellcheck="true" aria-label="Snippet text" placeholder="Text to copy and paste…">' + esc(s.text || "") + "</textarea></div>";
		}).join("");
		$("sl-snips-n").textContent = snips.length ? snips.length + " saved" : "your own snippets to copy and paste";
	}
	$("sl-snip-add").onclick = function () {
		snips.push({ label: "", text: "" }); saveSnips(); renderSnips();
		$("sl-snips").open = true;
		var t = $("sl-snip-list").querySelectorAll(".sl-snip-label"); if (t.length) t[t.length - 1].focus();
	};
	$("sl-snip-list").addEventListener("input", function (e) {
		var row = e.target.closest(".sl-snip"); if (!row) return;
		var s = snips[+row.dataset.i];
		if (e.target.classList.contains("sl-snip-label")) s.label = e.target.value;
		else if (e.target.classList.contains("sl-snip-text")) s.text = e.target.value;
		saveSnips();
	});
	$("sl-snip-list").addEventListener("click", function (e) {
		var row = e.target.closest(".sl-snip"), btn = e.target.closest("button"); if (!row || !btn) return;
		var i = +row.dataset.i;
		if (btn.classList.contains("sl-snip-copy")) {
			var t = snips[i].text || ""; if (!t) { toast("Nothing to copy yet"); return; }
			copy(t).then(function (ok) { toast(ok ? "Copied" + (snips[i].label ? " “" + snips[i].label + "”" : "") : "Copy failed: select the text instead"); });
		} else if (btn.classList.contains("sl-snip-del")) {
			if (snips[i].text && !confirm("Delete this text?")) return;
			snips.splice(i, 1); saveSnips(); renderSnips();
		}
	});
	renderSnips();
	if (snips.length) $("sl-snips").open = true;

	/* ---------- a Copy button on every parsed field ---------- */
	var COPY_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
	F.forEach(function (k) {
		var inp = $("sl-" + k), w = document.createElement("div");
		w.className = "sl-iw"; inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
		var b = document.createElement("button");
		b.type = "button"; b.className = "sl-fcopy"; b.innerHTML = COPY_ICON; b.title = "Copy this field"; b.setAttribute("aria-label", "Copy " + k);
		b.onclick = function () {
			var t = inp.value.trim(); if (!t) { toast("Nothing to copy yet"); return; }
			copy(t).then(function (ok) { toast(ok ? "Copied " + k : "Copy failed: select the text instead"); });
		};
		w.appendChild(b);
	});

	var saved = store.get("post", null);
	if (saved) { $("sl-blob").value = saved.blob || ""; fill(saved); }
	$("sl-label").value = store.get("label", "🔗 Full post:");
	$("sl-hidedone").checked = store.get("hidedone", false);
	$("sl-sdate").value = live.sdate || ""; $("sl-stime").value = live.stime || ""; $("sl-szone").value = live.szone || defaultZone();
	syncMode();
	render();
})();

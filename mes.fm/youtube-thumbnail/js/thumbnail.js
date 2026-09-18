/* MES YouTube Thumbnail Grabber -- mes.fm/youtube-thumbnail
 *
 * Paste a video link, see its thumbnail + a direct link to it. YouTube is
 * handled entirely client-side (its thumbnail CDN is public, no API key or
 * CORS issue -- just build the URL from the video ID and probe which sizes
 * actually exist). 3Speak, BitChute, Odysee, and Rumble each need a
 * platform-specific lookup that either requires a POST body, a User-Agent
 * override, or simply has no CORS header, so those route through this site's
 * own /api/thumbnail endpoint (see mes.fm/api/thumbnail.js), which does
 * nothing but ask that platform for its already-public thumbnail and hand it
 * back -- nothing pasted here is stored anywhere.
 */
(function () {
	"use strict";

	var $ = function (id) { return document.getElementById(id); };

	var urlInput = $("ytt-url");
	var fetchBtn = $("ytt-fetch");
	var errorEl = $("ytt-error");
	var resultEl = $("ytt-result");
	var imageEl = $("ytt-image");
	var titleEl = $("ytt-title");
	var platformEl = $("ytt-platform");
	var linksEl = $("ytt-links");
	var toastEl = $("ytt-toast");

	var YOUTUBE_RE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

	// maxresdefault/sddefault only exist if the uploader's source video was
	// itself high enough resolution -- hqdefault always exists for a real
	// video. Checked in this order, first one found wins.
	var YT_SIZES = [
		{ key: "maxresdefault", label: "Max (1280×720)" },
		{ key: "sddefault", label: "SD (640×480)" },
		{ key: "hqdefault", label: "HQ (480×360)" },
		{ key: "mqdefault", label: "MQ (320×180)" },
		{ key: "default", label: "Default (120×90)" }
	];

	var PLATFORM_LABELS = { "3speak": "3Speak", bitchute: "BitChute", odysee: "Odysee", rumble: "Rumble" };

	var toastTimer = null;
	function toast(msg) {
		toastEl.textContent = msg;
		toastEl.classList.add("ytt__toast--show");
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () { toastEl.classList.remove("ytt__toast--show"); }, 1800);
	}

	function copyText(text) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text).then(
				function () { toast("Link copied"); },
				function () { toast("Couldn't copy — copy it manually"); }
			);
		} else {
			toast("Copy isn't supported in this browser");
		}
	}

	function showError(msg) {
		errorEl.textContent = msg;
		errorEl.classList.remove("hide");
		resultEl.classList.add("hide");
	}

	function buildLinkRow(url, label) {
		var row = document.createElement("div");
		row.className = "ytt__link-row";
		var a = document.createElement("a");
		a.href = url;
		a.target = "_blank";
		a.rel = "noopener";
		a.textContent = label;
		var btn = document.createElement("button");
		btn.type = "button";
		btn.className = "ytt__btn ytt__btn--ghost";
		btn.textContent = "Copy link";
		btn.addEventListener("click", function () { copyText(url); });
		row.appendChild(a);
		row.appendChild(btn);
		return row;
	}

	// opts: {title, platform, image, sizes: [{label, url}]} -- sizes is only
	// passed for YouTube (several real options); everything else gets a
	// single "Thumbnail link" row for its one resolution.
	function showResult(opts) {
		if (opts.title) {
			titleEl.textContent = opts.title;
			titleEl.classList.remove("hide");
		} else {
			titleEl.classList.add("hide");
		}
		platformEl.textContent = opts.platform;
		imageEl.src = opts.image;
		imageEl.alt = opts.title || "Video thumbnail";

		linksEl.innerHTML = "";
		var sizes = opts.sizes || [{ label: "Thumbnail link", url: opts.image }];
		sizes.forEach(function (s) {
			linksEl.appendChild(buildLinkRow(s.url, s.label));
		});

		errorEl.classList.add("hide");
		resultEl.classList.remove("hide");
	}

	// YouTube serves a small grey placeholder image (120x90) for a size that
	// doesn't exist for this video, instead of a real 404 -- so "did this
	// size load" isn't enough; check its actual pixel width too, and fall
	// through to the next smaller size when it's that placeholder.
	function probeYoutubeSize(id, index, found) {
		if (index >= YT_SIZES.length) {
			if (!found.length) {
				showError("Couldn't find a thumbnail for that YouTube video — double-check the link.");
				return;
			}
			finishYoutube(id, found);
			return;
		}
		var size = YT_SIZES[index];
		var url = "https://i.ytimg.com/vi/" + id + "/" + size.key + ".jpg";
		var probe = new Image();
		probe.onload = function () {
			var isPlaceholder = probe.naturalWidth === 120 && probe.naturalHeight === 90 && size.key !== "default";
			if (!isPlaceholder) found.push({ label: size.label, url: url });
			probeYoutubeSize(id, index + 1, found);
		};
		probe.onerror = function () { probeYoutubeSize(id, index + 1, found); };
		probe.src = url;
	}

	function finishYoutube(id, sizes) {
		showResult({
			title: null,
			platform: "YouTube — video ID " + id,
			image: sizes[0].url,
			sizes: sizes
		});
	}

	function handleOtherPlatform(rawUrl) {
		fetchBtn.disabled = true;
		fetchBtn.textContent = "Looking up…";
		fetch("/api/thumbnail?url=" + encodeURIComponent(rawUrl))
			.then(function (res) {
				if (!res.ok) throw new Error("lookup failed");
				return res.json();
			})
			.then(function (data) {
				if (!data || !data.thumbnail) throw new Error("no thumbnail");
				showResult({
					title: data.title,
					platform: PLATFORM_LABELS[data.platform] || data.platform,
					image: data.thumbnail
				});
			})
			.catch(function () {
				showError("Couldn't find a thumbnail for that link — double-check the URL and try again.");
			})
			.then(function () {
				fetchBtn.disabled = false;
				fetchBtn.textContent = "Get Thumbnail";
			});
	}

	function handleFetch() {
		var raw = urlInput.value.trim();
		if (!raw) {
			showError("Paste a video link first.");
			return;
		}
		if (!/^https?:\/\//i.test(raw)) {
			showError("That doesn't look like a video link — paste the full URL.");
			return;
		}

		var ytMatch = raw.match(YOUTUBE_RE);
		if (ytMatch) {
			probeYoutubeSize(ytMatch[1], 0, []);
			return;
		}

		if (/3speak\.tv|bitchute\.com|odysee\.com|rumble\.com/i.test(raw)) {
			handleOtherPlatform(raw);
			return;
		}

		showError("That link isn't from a supported platform — YouTube, 3Speak, BitChute, Odysee, or Rumble.");
	}

	fetchBtn.addEventListener("click", handleFetch);
	urlInput.addEventListener("keydown", function (e) {
		if (e.key === "Enter") handleFetch();
	});
})();

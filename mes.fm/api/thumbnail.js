// Serverless backend for mes.fm/youtube-thumbnail's non-YouTube lookups.
//
// YouTube's own thumbnail CDN (i.ytimg.com) is public with no CORS
// restriction, so the client fetches those directly -- this endpoint is
// never involved for YouTube links. The other four platforms each need a
// server-side request instead:
//   - 3Speak's embed API *does* allow direct browser CORS, but routing it
//     through here too keeps the client code uniform and avoids depending
//     on that staying true.
//   - BitChute's video pages happened to allow CORS when this was written,
//     but that's an accident of their CDN config, not a documented contract.
//   - Odysee's resolve API requires a POST body most simple embed widgets
//     don't bother with, and returns a large claim object the client
//     shouldn't need to parse itself.
//   - Rumble's oEmbed endpoint has no CORS header at all -- a browser fetch
//     to it is blocked outright.
//
// GET ?url=<pasted video link>  ->  { platform, title, thumbnail }
const UA = "Mozilla/5.0 (compatible; mes.fm-thumbnail/1.0; +https://mes.fm/youtube-thumbnail)";

// Backreference-matched quotes (not a naive ["'] class) so a content value
// containing the *other* quote character doesn't truncate the match --
// same helper used by this repo's build.mjs scrapers.
function readMetaTag(html, prop) {
  const p = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = html.match(new RegExp(`<meta[^>]+property=(["'])${p}\\1[^>]*\\bcontent=(["'])([\\s\\S]*?)\\2`, "i"));
  return m ? m[3].trim() : "";
}

async function resolve3Speak(url) {
  const m = url.match(/3speak\.tv\/(?:watch|embed)\?v=([\w.-]+)\/([\w.-]+)/);
  if (!m) return null;
  const [, owner, permlink] = m;
  const res = await fetch(`https://play.3speak.tv/api/embed?v=${owner}/${permlink}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.thumbnail) return null;
  return { platform: "3speak", title: data.title || null, thumbnail: data.thumbnail };
}

async function resolveBitChute(url) {
  const m = url.match(/bitchute\.com\/(?:video|embed)\/([a-zA-Z0-9]+)/);
  if (!m) return null;
  const pageUrl = `https://www.bitchute.com/video/${m[1]}/`;
  const res = await fetch(pageUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const html = await res.text();
  const thumbnail = readMetaTag(html, "og:image");
  if (!thumbnail) return null;
  return { platform: "bitchute", title: readMetaTag(html, "og:title") || null, thumbnail };
}

async function resolveOdysee(url) {
  let path;
  try {
    path = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
  if (!path) return null;
  const res = await fetch("https://api.na-backend.odysee.com/api/v1/proxy?m=resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "resolve", params: { urls: [path] } }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const claim = data && data.result && data.result[path];
  if (!claim || claim.error || !claim.value) return null;
  const thumbnail = claim.value.thumbnail && claim.value.thumbnail.url;
  if (!thumbnail) return null;
  return { platform: "odysee", title: claim.value.title || null, thumbnail };
}

async function resolveRumble(url) {
  const res = await fetch(`https://rumble.com/api/Media/oembed.json?url=${encodeURIComponent(url)}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.thumbnail_url) return null;
  return { platform: "rumble", title: data.title || null, thumbnail: data.thumbnail_url };
}

async function resolveThumbnail(url) {
  if (/3speak\.tv\//i.test(url)) return resolve3Speak(url);
  if (/bitchute\.com\//i.test(url)) return resolveBitChute(url);
  if (/odysee\.com\//i.test(url)) return resolveOdysee(url);
  if (/rumble\.com\//i.test(url)) return resolveRumble(url);
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const url = String(req.query.url || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "missing or invalid url" });
    return;
  }

  let result;
  try {
    result = await resolveThumbnail(url);
  } catch {
    res.status(502).json({ error: "lookup failed" });
    return;
  }

  if (!result) {
    res.status(404).json({ error: "no thumbnail found" });
    return;
  }

  // The thumbnail itself is a stable, already-public image, so caching this
  // response for a while is safe and saves a redundant round trip for the
  // same link on a repeat visit.
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.status(200).json(result);
};

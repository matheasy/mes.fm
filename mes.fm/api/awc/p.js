// alpinewestcreative.com page views: www.alpinewestcreative.com/p (same-origin, so ad blockers that stop a site from
// beaconing mes.fm/api/track let it through) is proxied here by her vercel.json, and the normal tracker files it under
// the awc: keys (api/track.js OTHER_SITES). Not behind the login (middleware.js AWC_OPEN).
module.exports = require('../track.js');

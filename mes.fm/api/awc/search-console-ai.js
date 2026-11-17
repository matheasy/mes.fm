// alpinewestcreative.com dashboard: the normal /api/search-console-ai handler, run for site 'awc' (own key prefix, own Bing site; see api/_site.js)
const handler = require('../search-console-ai.js');
const SITE = require('../_site.js');
module.exports = (req, res) => SITE.runAs('awc', () => handler(req, res));

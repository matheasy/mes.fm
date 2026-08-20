const TOP_N = 50;

function parseMember(member, score) {
  const sep = member.indexOf('|');
  return {
    site: sep === -1 ? member : member.slice(0, sep),
    path: sep === -1 ? '' : member.slice(sep + 1),
    views: Number(score),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const commands = [
    ['ZREVRANGE', 'pageviews:leaderboard', '0', String(TOP_N - 1), 'WITHSCORES'],
    ['HGETALL', 'pageviews:site-totals'],
  ];

  let topPagesRaw = [];
  let siteTotalsRaw = [];

  try {
    const upstashRes = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
    const [topPagesResult, siteTotalsResult] = await upstashRes.json();
    topPagesRaw = topPagesResult.result || [];
    siteTotalsRaw = siteTotalsResult.result || [];
  } catch {
    res.status(502).json({ error: 'stats unavailable' });
    return;
  }

  const topPages = [];
  for (let i = 0; i < topPagesRaw.length; i += 2) {
    topPages.push(parseMember(topPagesRaw[i], topPagesRaw[i + 1]));
  }

  const siteTotals = [];
  for (let i = 0; i < siteTotalsRaw.length; i += 2) {
    siteTotals.push({ site: siteTotalsRaw[i], views: Number(siteTotalsRaw[i + 1]) });
  }
  siteTotals.sort((a, b) => b.views - a.views);

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json({
    topPages,
    siteTotals,
    updatedAt: new Date().toISOString(),
  });
};

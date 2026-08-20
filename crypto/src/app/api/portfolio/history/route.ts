import { NextResponse } from 'next/server';
import { fetchAllSources } from '@/lib/combine';
import type { ApiResult, PortfolioValuePoint } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const results = await fetchAllSources<PortfolioValuePoint[]>('/api/portfolio/history');

  if (results.every((r) => r.data === null)) {
    const rateLimited = results.every((r) => r.rateLimited);
    return NextResponse.json(
      { error: results[0]?.error ?? 'Failed to load any wallet history', rateLimited } satisfies ApiResult<
        PortfolioValuePoint[]
      >,
      { status: rateLimited ? 429 : 502 },
    );
  }

  // Merge each wallet's step series into one combined series: at every timestamp any wallet's
  // value changed, sum each wallet's last-known value at or before that moment (forward-fill).
  const series = results.map((r) => ({
    points: (r.data ?? []).slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    lastValue: 0,
    nextIndex: 0,
  }));
  const timestamps = Array.from(new Set(series.flatMap((s) => s.points).map((p) => p.timestamp))).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );

  const combined: PortfolioValuePoint[] = timestamps.map((timestamp) => {
    const t = new Date(timestamp).getTime();
    for (const s of series) {
      while (s.nextIndex < s.points.length && new Date(s.points[s.nextIndex]!.timestamp).getTime() <= t) {
        s.lastValue = s.points[s.nextIndex]!.totalValueUsd;
        s.nextIndex++;
      }
    }
    const total = series.reduce((sum, s) => sum + s.lastValue, 0);
    return { timestamp, totalValueUsd: total };
  });

  return NextResponse.json({ data: combined } satisfies ApiResult<PortfolioValuePoint[]>);
}

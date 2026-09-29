import { NextResponse } from 'next/server';
import { deleteLabel, listLabels, setLabel } from '@/lib/labels';
import type { ApiResult, LabelRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const labels = await listLabels();
  return NextResponse.json({ data: labels } satisfies ApiResult<Record<string, LabelRecord>>);
}

interface PutBody {
  id: string;
  tag: string;
  notes: string;
  screenshotUrls: string[];
}

export async function PUT(request: Request) {
  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' } satisfies ApiResult<LabelRecord>, { status: 400 });
  }
  if (!body.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'Missing "id"' } satisfies ApiResult<LabelRecord>, { status: 400 });
  }

  const record = await setLabel(body.id, {
    tag: typeof body.tag === 'string' ? body.tag : '',
    notes: typeof body.notes === 'string' ? body.notes : '',
    screenshotUrls: Array.isArray(body.screenshotUrls) ? body.screenshotUrls.filter((u) => typeof u === 'string') : [],
  });

  return NextResponse.json({ data: record } satisfies ApiResult<LabelRecord>);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing "id"' } satisfies ApiResult<null>, { status: 400 });
  await deleteLabel(id);
  return NextResponse.json({ data: null } satisfies ApiResult<null>);
}

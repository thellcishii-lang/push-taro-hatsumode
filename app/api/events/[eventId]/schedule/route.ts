// app/api/events/[eventId]/schedule/route.ts
// 主催者向け行事タイムテーブル API: 一覧と登録。
// 認証は他の主催者向け API と同じ requireEventOwner。
import { NextResponse } from 'next/server';
import { requireEventOwner } from '@/lib/event-auth';
import {
  createScheduleEntry,
  listScheduleEntries,
  validateScheduleEntryInput,
  type ScheduleEntryInput,
} from '@/lib/event-schedule';

export const dynamic = 'force-dynamic';

function readInput(body: Record<string, unknown>): ScheduleEntryInput {
  return {
    title: typeof body.title === 'string' ? body.title : '',
    date: typeof body.date === 'string' ? body.date : '',
    startTime: typeof body.startTime === 'string' ? body.startTime : '',
    endTime: typeof body.endTime === 'string' ? body.endTime : null,
    place: typeof body.place === 'string' ? body.place : '',
    note: typeof body.note === 'string' ? body.note : '',
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const guard = await requireEventOwner(request, eventId);
  if ('error' in guard) return guard.error;
  const entries = await listScheduleEntries(eventId);
  return NextResponse.json({ entries });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const guard = await requireEventOwner(request, eventId);
  if ('error' in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 });
  }
  const input = readInput(body);
  const validated = validateScheduleEntryInput(input);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  try {
    const entry = await createScheduleEntry(eventId, input);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '行事の登録に失敗しました' },
      { status: 400 },
    );
  }
}

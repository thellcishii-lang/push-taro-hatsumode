// app/api/events/[eventId]/schedule/[entryId]/route.ts
// 主催者向け行事タイムテーブル API: 1件の更新と削除。
import { NextResponse } from 'next/server';
import { requireEventOwner } from '@/lib/event-auth';
import {
  deleteScheduleEntry,
  updateScheduleEntry,
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string; entryId: string }> },
) {
  const { eventId, entryId } = await params;
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
    const entry = await updateScheduleEntry(eventId, entryId, input);
    return NextResponse.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : '行事の更新に失敗しました';
    return NextResponse.json(
      { error: message },
      { status: message === '行事が見つかりません' ? 404 : 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string; entryId: string }> },
) {
  const { eventId, entryId } = await params;
  const guard = await requireEventOwner(request, eventId);
  if ('error' in guard) return guard.error;

  const deleted = await deleteScheduleEntry(eventId, entryId);
  if (!deleted) {
    return NextResponse.json({ error: '行事が見つかりません' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

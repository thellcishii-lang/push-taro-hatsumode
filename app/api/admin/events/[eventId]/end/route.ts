// app/api/admin/events/[eventId]/end/route.ts
// 主催者によるイベントの手動終了の受付。
//
// ここでは manualEndAt（受付時刻）を記録するだけ。実際の終了処理
// （集計→バックアップ→レポート送信→出店者課金の自動解約→登録情報の
// 全消去→status='ended'）は、次回のスケジューラ実行（15分間隔の
// event-tick。終了処理が最優先）で lib/event-reset.ts の
// executeEventFinalization が行う（isFinalizationDue が manualEndAt を
// 見て日付に関係なく対象にする）。
// 認証・所有者確認は主催者向けAPIの共通ガード（requireEventOwner）を使う。
import { NextResponse } from 'next/server';
import { requireEventOwner } from '@/lib/event-auth';
import { getEvent, updateEvent } from '@/lib/event-store';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const guard = await requireEventOwner(request, eventId);
  if ('error' in guard) return guard.error;
  const event = guard.event;

  // 既に手動終了を受け付け済みなら、冪等に成功として扱う（ボタンの二度押し対策）。
  if (event.manualEndAt) {
    return NextResponse.json({ event });
  }
  if (event.finalizedAt) {
    return NextResponse.json(
      { error: '既に終了処理が完了しています' },
      { status: 409 },
    );
  }
  if (event.status !== 'live') {
    return NextResponse.json(
      { error: '開催中のイベントだけ終了できます' },
      { status: 409 },
    );
  }

  try {
    await updateEvent(eventId, { manualEndAt: new Date().toISOString() });
    const updated = await getEvent(eventId);
    return NextResponse.json({ event: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '終了の受付に失敗しました' },
      { status: 400 },
    );
  }
}

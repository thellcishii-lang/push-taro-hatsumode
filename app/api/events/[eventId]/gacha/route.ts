// app/api/events/[eventId]/gacha/route.ts
// 参拝者本人のガチャ状態取得。端末認証のトークンから memberId を導き、
// 抽選済みなら結果（当選なら景品交換コードと消込状態も）を返す。
// 抽選記録は日次リセットの対象外に置かれるため、登録レコードが
// リセットされた後でも結果は読み返せる（おみくじと同じ作法）。
import { NextResponse } from 'next/server';
import { getGachaDraw } from '@/lib/event-gacha';
import { getEvent } from '@/lib/event-store';
import { memberIdFromRequest } from '@/lib/event-member-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await memberIdFromRequest(request);
  if ('error' in auth) return auth.error;

  const event = await getEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 });
  }

  const draw = await getGachaDraw(eventId, auth.memberId);
  if (!draw) {
    return NextResponse.json({ enabled: event.gachaEnabled, drawn: false });
  }
  return NextResponse.json({
    enabled: event.gachaEnabled,
    drawn: true,
    rank: draw.rank,
    prizeName: draw.prizeName,
    code: draw.code,
    redeemed: draw.redeemed,
    drawnAt: draw.drawnAt,
  });
}

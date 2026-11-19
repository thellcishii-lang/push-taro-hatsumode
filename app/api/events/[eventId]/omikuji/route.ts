// app/api/events/[eventId]/omikuji/route.ts
// 参拝者本人のおみくじ状態取得。端末認証のトークンから memberId を導き、
// 抽選済みなら結果を返す。抽選記録は日次リセットの対象外に置かれるため、
// 登録レコードがリセットされた後でも結果は読み返せる。
import { NextResponse } from 'next/server';
import { getOmikujiDraw } from '@/lib/event-omikuji';
import { memberIdFromRequest } from '@/lib/event-member-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await memberIdFromRequest(request);
  if ('error' in auth) return auth.error;

  const draw = await getOmikujiDraw(eventId, auth.memberId);
  if (!draw) {
    return NextResponse.json({ drawn: false });
  }
  return NextResponse.json({
    drawn: true,
    grade: draw.grade,
    drawnAt: draw.drawnAt,
  });
}

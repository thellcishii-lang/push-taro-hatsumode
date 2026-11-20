// app/api/events/[eventId]/gacha/draw/route.ts
// 参拝者のガチャ抽選。端末認証のトークンが必須で、
// 端末から導く memberId に紐づけて記録する（シーズンを通して1端末1回、
// 再抽選リクエストには既存の結果を冪等に返す。おみくじと同じ作法）。
import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { drawGacha } from '@/lib/event-gacha';
import { memberIdFromRequest } from '@/lib/event-member-auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const retryAfter = await enforceRateLimit(request, 'event-gacha-draw', 10, 60 * 1000);
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: 'レート制限を超えました' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const { eventId } = await params;

  const auth = await memberIdFromRequest(request);
  if ('error' in auth) return auth.error;

  const result = await drawGacha(eventId, auth.memberId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    {
      ok: true,
      rank: result.rank,
      prizeName: result.prizeName,
      code: result.code,
      redeemed: result.redeemed,
      alreadyDrawn: result.alreadyDrawn,
      drawnAt: result.drawnAt,
    },
    { status: result.alreadyDrawn ? 200 : 201 },
  );
}

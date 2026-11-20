// app/api/events/[eventId]/registration-status/route.ts
// 参拝者本人の登録状態の確認。来場者ページが開くたびに呼び、登録済みの
// 端末には登録バナー（プッシュ通知を受け取る）を出さないために使う。
// 認証は他の参拝者 API と同じ作法: 端末認証のトークンから memberId を導く。
import { NextResponse } from 'next/server';
import { memberIdFromRequest } from '@/lib/event-member-auth';
import { getVisitorRegistrationStatus } from '@/lib/event-register';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await memberIdFromRequest(request);
  if ('error' in auth) return auth.error;

  const result = await getVisitorRegistrationStatus(eventId, auth.memberId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ registered: result.registered });
}

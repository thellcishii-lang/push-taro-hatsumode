// app/api/events/[eventId]/language/route.ts
// 登録済み参拝者の言語変更。端末認証のトークンから本人を特定し、
// 購読者レコードの言語と FCM トピックの付け替えを行う。
import { NextResponse } from 'next/server';
import { updateSubscriberLanguage } from '@/lib/event-register';
import { memberIdFromRequest } from '@/lib/event-member-auth';
import { isLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await memberIdFromRequest(request);
  if ('error' in auth) return auth.error;
  const memberId = auth.memberId;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 });
  }
  if (!isLocale(body.lang)) {
    return NextResponse.json({ error: '対応していない言語です' }, { status: 400 });
  }

  const result = await updateSubscriberLanguage(eventId, memberId, body.lang);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

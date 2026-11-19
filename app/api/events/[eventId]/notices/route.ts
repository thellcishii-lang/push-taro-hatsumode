// app/api/events/[eventId]/notices/route.ts
// 参拝者本人の「お知らせ」一覧: 送信済みプッシュを読み返すための取得専用 API。
// 認証はクーポン取得と同じ作法: 端末認証のトークンから memberId を
// 導き、購読者レコードがある参拝者にだけ返す（未登録の端末では読めない）。
// 文面は本人の言語（購読者レコードの lang、無ければイベントのデフォルト）で
// 解決し、添付ファイル（宣伝 PDF / 画像）のリンク先もあわせて返す。
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { EVENT_SUBCOLLECTIONS } from '@/lib/event';
import { memberIdFromRequest } from '@/lib/event-member-auth';
import { getEvent } from '@/lib/event-store';
import { buildNotices, listCampaigns } from '@/lib/event-push';
import { isLocale, resolveLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await memberIdFromRequest(request);
  if ('error' in auth) return auth.error;
  const memberId = auth.memberId;

  const event = await getEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 });
  }

  const subscriberSnap = await db
    .collection('events')
    .doc(eventId)
    .collection(EVENT_SUBCOLLECTIONS.subscribers)
    .doc(memberId)
    .get();
  if (!subscriberSnap.exists) {
    return NextResponse.json(
      { error: 'このイベントに登録していません' },
      { status: 403 },
    );
  }

  // 表示言語: 画面の指定 > 購読者の言語 > イベントのデフォルト > 日本語
  const langParam = new URL(request.url).searchParams.get('lang');
  const locale = isLocale(langParam)
    ? langParam
    : resolveLocale(subscriberSnap.data()?.lang, event.defaultLocale);

  const campaigns = await listCampaigns(eventId);
  const notices = buildNotices(campaigns, locale, event.defaultLocale);
  return NextResponse.json({ notices });
}

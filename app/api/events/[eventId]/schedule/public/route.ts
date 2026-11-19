// app/api/events/[eventId]/schedule/public/route.ts
// 参拝者向けの行事タイムテーブル。認証なしで閲覧できる（登録前の案内にも使う）。
// ?lang= があれば、タイトル・場所・備考をその言語で返す（作成時の自動翻訳を使用）。
// 並びは日時順で、日付ごとのグループ化は画面側で行う。
import { NextResponse } from 'next/server';
import { listScheduleEntries } from '@/lib/event-schedule';
import { getEvent } from '@/lib/event-store';
import { normalizeLocale, pickLocalizedText } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const { searchParams } = new URL(request.url);
  const event = await getEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 });
  }
  const locale = normalizeLocale(searchParams.get('lang'), event.defaultLocale);
  const all = await listScheduleEntries(eventId);
  const entries = all.map((entry) => ({
    id: entry.id,
    title: pickLocalizedText(entry.titleI18n, locale, event.defaultLocale) || entry.title,
    date: entry.date,
    startTime: entry.startTime,
    endTime: entry.endTime,
    place: pickLocalizedText(entry.placeI18n, locale, event.defaultLocale) || entry.place,
    note: pickLocalizedText(entry.noteI18n, locale, event.defaultLocale) || entry.note,
  }));
  return NextResponse.json({ entries });
}

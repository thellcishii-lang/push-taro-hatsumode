// app/api/events/[eventId]/public/route.ts
// 参拝者向けの公開情報。登録前の参拝者が見るため認証なしで返すが、
//返すのは表示に必要な最小項目だけ（所有者uidなどは出さない）。
import { NextResponse } from 'next/server';
import { getEvent } from '@/lib/event-store';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 });
  }
  return NextResponse.json({
    event: {
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      status: event.status,
      resetMode: event.resetMode,
      defaultLocale: event.defaultLocale,
      // 入場用QRの取り込みが有効かどうか（参拝者画面の表示制御に使う）
      admissionQrEnabled: event.admissionQrEnabled,
      // 主催者リンク（最大3件、タイトル付きで参拝者画面に表示する）
      links: event.links,
    },
  });
}

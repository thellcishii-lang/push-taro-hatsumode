// lib/new-year-push.ts
// 年始プッシュ（1月1日0時台に登録者全員へ新年の挨拶を自動送信）の文面と、
// 送信すべきかどうかの判定（純粋関数）。
// 実際の送信は lib/event-push.ts の processNewYearPush が担う。
// 主催者はイベント設定でオン/オフできる（既定オン）。
import type { Locale } from './i18n';
import { jstDateString, jstTimeString, type EventConfig } from './event';

/** 年始プッシュの言語別文面。タップすると参拝者画面が開き、羊の挨拶が出る。 */
export const NEW_YEAR_PUSH_TEXTS: Record<
  Locale,
  { title: string; body: string }
> = {
  ja: {
    title: 'あけましておめでとうございます',
    body: '初詣のおみくじが引けます。良い一年になりますように。',
  },
  en: {
    title: 'Happy New Year!',
    body: 'You can draw your New Year omikuji now. Wishing you a wonderful year!',
  },
  zh: {
    title: '新年快乐！',
    body: '现在可以抽新年御神签了。祝您新的一年万事如意！',
  },
  ko: {
    title: '새해 복 많이 받으세요!',
    body: '새해 오미쿠지를 뽑을 수 있습니다. 좋은 한 해 되세요!',
  },
};

/** 年始プッシュを送る時間帯の終わり（JST の HH:MM）。0時台の tick でだけ送る。 */
export const NEW_YEAR_PUSH_WINDOW_END = '01:00';

/**
 * この tick で年始プッシュを送るべきか。
 * - イベントが開催中
 * - 主催者がオフにしていない
 * - JST で1月1日の0時台
 * - その年はまだ送っていない
 */
export function isNewYearPushDue(
  event: Pick<
    EventConfig,
    'status' | 'newYearPushEnabled' | 'newYearPushSentYear'
  >,
  now: Date,
): boolean {
  if (event.status !== 'live') return false;
  if (!event.newYearPushEnabled) return false;
  const date = jstDateString(now);
  if (!date.endsWith('-01-01')) return false;
  if (jstTimeString(now) >= NEW_YEAR_PUSH_WINDOW_END) return false;
  return event.newYearPushSentYear !== Number(date.slice(0, 4));
}

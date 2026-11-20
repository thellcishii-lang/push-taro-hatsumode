// lib/event.ts
// Push-taro 初詣 のイベント設定モデル（純粋な型・定数・判定ロジックのみ）。
// Firestore への読み書きは lib/event-store.ts に分離する。
//
// 設計原則（干渉しない・波及しない）:
// - イベントごとにデータ名前空間を分ける（events/{eventId} 配下で完結）。
// - リセット等の定期処理は「固定時刻の一括 cron」にせず、
//   15分間隔のスケジューラがイベント単独で拾って実行する前提の判定関数を用意する。

import type { Locale } from './i18n';

/** 日次リセットの方式。イベントごとに選択する。 */
export type EventResetMode =
  /** 方式A: 購読も端末情報も毎日消去する（単日イベント向け） */
  | 'full-daily'
  /** 方式B: 毎日リセットするのは購読のみ。端末情報と取得・消込記録は期間中保持し、終了時に消去する */
  | 'keep-phones'
  /** リセットしない: 日次リセットを行わない。登録・クーポン記録は期間中ずっと保持し、終了時に全て消去する */
  | 'none';

export type EventStatus = 'draft' | 'live' | 'ended';

/**
 * 主催者リンク（最大3件）。参拝者画面にタイトル付きカードで表示される。
 * イベントドキュメントの links フィールドに配列で持つ。
 * タイトルは主催者が書いた原文のまま表示する（案内PDFのタイトルと同じ扱い、
 * 自動翻訳しない）。
 */
export interface EventLink {
  title: string;
  url: string;
}

export interface EventConfig {
  id: string;
  /** イベント名（例: 神社名・行事名） */
  name: string;
  /** 主催者の Firebase Auth uid */
  ownerUid: string;
  /** 開催開始日（JST, 'YYYY-MM-DD'） */
  startDate: string;
  /** 開催終了日（JST, 'YYYY-MM-DD'）。この日を過ぎたら終了処理（登録情報消去）の対象 */
  endDate: string;
  /**
   * 終了日が「未定」かどうか。未定の場合、endDate にはシーズン終了日
   * （1月31日。seasonEndDateFor で算出）が入っており、判定はその日付で
   * 行い、表示上は「未定」として扱う。
   * 導入前に作られたイベントには項目自体が無いため、読み取り時は false に倒す。
   */
  endDateUndecided: boolean;
  resetMode: EventResetMode;
  /** リセット時刻（JST, 'HH:MM'）。イベントごとに変更可能 */
  resetTime: string;
  /** 契約枠（料金段階）の登録者数。データとして保持するだけで、登録可否には使わない（初詣は登録上限なし） */
  subscriberCap: number;
  /** イベントのデフォルト言語（主催者が設定）。個人の言語選択がこれを上書きする */
  defaultLocale: Locale;
  /**
   * 入場用QRの取り込みを有効にするか（主催者が設定。既定オフ）。
   * オンにすると、参拝者が主催者側の既存システム（事前登録・チケット等）から
   * 受け取った入場用QRを自分の画面で読み込んで購読者レコードに保存し、
   * 入場時に表示できる。オフの間は参拝者画面に何も出ず、保存もできない。
   */
  admissionQrEnabled: boolean;
  /**
   * 主催者リンク（最大 MAX_EVENT_LINKS 件）。設定画面で登録し、参拝者画面に
   * タイトル付きで表示する（案内PDFと同じく登録前でも見える位置）。
   * 未登録なら空配列で、参拝者画面には何も出ない。
   * 導入前に作られたイベントには項目自体が無いため、読み取り時は空配列に倒す。
   */
  links: EventLink[];
  /**
   * クーポン上限（イベント全体の件数）。購読者上限と同じく契約枠の軸なので、
   * 変更は運営側のみ。既定は MAX_COUPONS_PER_EVENT。
   */
  couponCap: number;
  /**
   * 最終レポートの運営用バックアップ保持日数（契約ごとに設定）。
   * バックアップは削除対象の外に置き、期限を過ぎたら自動消去する。
   */
  backupRetentionDays: number;
  status: EventStatus;
  /** 最後に日次リセットを実行した JST 日付（'YYYY-MM-DD'）。未実施なら null */
  lastResetDate: string | null;
  /**
   * 主催者が手動終了を受け付けた時刻（ISO文字列）。設定されると、次回の
   * スケジューラ実行で終了処理（集計→消去）が日付に関係なく走る。
   * 未受付なら null。
   */
  manualEndAt: string | null;
  /** 終了処理（登録情報消去まで）を完了したかどうか */
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** events/{eventId} 配下のサブコレクション名 */
export const EVENT_SUBCOLLECTIONS = {
  /** プッシュ購読（端末ごとの購読情報） */
  subscribers: 'subscribers',
  /** 端末キー本人確認レコード（端末の識別子を含む。電話番号は持たない） */
  members: 'members',
  /** クーポン取得記録（端末キーに紐づく） */
  claims: 'claims',
  /** クーポン消込記録（端末キーに紐づく） */
  redemptions: 'redemptions',
} as const;

export type EventSubcollection =
  (typeof EVENT_SUBCOLLECTIONS)[keyof typeof EVENT_SUBCOLLECTIONS];

export const DEFAULT_SUBSCRIBER_CAP = 50_000;
export const MAX_COUPONS_PER_EVENT = 100;
/**
 * 1主催者が同時に仕込めるイベント数の上限（下書き＋開催中）。
 * 会場日程が重なる運用（例: 月-水／水-金／週末）を想定した製品ルール。
 * 終了したイベントは数えない。
 */
export const MAX_CONCURRENT_EVENTS = 3;
export const MAX_INFO_PDFS = 5;
export const MAX_EVENT_LINKS = 3;
export const DEFAULT_RESET_TIME = '00:00';
export const DEFAULT_BACKUP_RETENTION_DAYS = 30;
export const DEFAULT_RESET_MODE: EventResetMode = 'full-daily';

/** 新規イベントの入力。省略項目は既定値で補完する。 */
export interface CreateEventInput {
  name: string;
  ownerUid: string;
  startDate: string;
  endDate: string;
  /**
   * 終了日を「未定」にするかどうか。未定なら endDate の値は使わず、
   * シーズン終了日（seasonEndDateFor）で置き換えて保存する。
   */
  endDateUndecided?: boolean;
  /** 作成時の状態。未指定は下書き。'ended' は作成時には指定できない。 */
  status?: 'draft' | 'live';
  resetMode?: EventResetMode;
  resetTime?: string;
  subscriberCap?: number;
  defaultLocale?: Locale;
  admissionQrEnabled?: boolean;
  links?: EventLink[];
  couponCap?: number;
  backupRetentionDays?: number;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Date を JST の 'YYYY-MM-DD' に変換する（coupon-day.ts の couponDay と同じ方式）。 */
/** 購読者の言語別 FCM トピック名。配信は言語ごとにこのトピックへ送る。 */
export function localeTopic(eventId: string, locale: Locale): string {
  return `event_${eventId}_users_${locale}`;
}

export function jstDateString(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Date を JST の 'HH:MM' に変換する。 */
export function jstTimeString(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(11, 16);
}

/** 'HH:MM' 形式かどうかの簡易バリデーション（00:00〜23:59）。 */
export function isValidResetTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** https の URL かどうか。 */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function readLinkFields(item: unknown): { title: string; url: string } | null {
  if (!item || typeof item !== 'object') return null;
  const raw = item as { title?: unknown; url?: unknown };
  return {
    title: typeof raw.title === 'string' ? raw.title.trim() : '',
    url: typeof raw.url === 'string' ? raw.url.trim() : '',
  };
}

/**
 * 主催者リンクの入力を検証して正規化する（書き込み用。不正なら throw）。
 * - タイトルと URL はセット: 片方だけの枠はエラー
 * - 両方空の枠は未指定として読み飛ばす（設定画面の空枠がこれに当たる）
 * - URL は https のみ許可
 * - 実質の件数は最大 MAX_EVENT_LINKS 件
 */
export function normalizeEventLinks(input: unknown): EventLink[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error('リンクの形式が不正です');
  const links: EventLink[] = [];
  for (const item of input) {
    const fields = readLinkFields(item);
    if (!fields) throw new Error('リンクの形式が不正です');
    if (!fields.title && !fields.url) continue;
    if (!fields.title || !fields.url) {
      throw new Error('リンクのタイトルとURLは両方入力してください');
    }
    if (!isHttpsUrl(fields.url)) {
      throw new Error('リンクのURLは https:// で始まる必要があります');
    }
    links.push(fields);
  }
  if (links.length > MAX_EVENT_LINKS) {
    throw new Error(`リンクは最大${MAX_EVENT_LINKS}件までです`);
  }
  return links;
}

/**
 * 保存済みの主催者リンクを防御的に読む（読み取り用。throw しない）。
 * 項目が無い旧イベントは空配列。不正な要素は落とし、上限で切り詰める。
 */
export function parseEventLinks(value: unknown): EventLink[] {
  if (!Array.isArray(value)) return [];
  const links: EventLink[] = [];
  for (const item of value) {
    const fields = readLinkFields(item);
    if (fields && fields.title && fields.url && isHttpsUrl(fields.url)) {
      links.push(fields);
      if (links.length >= MAX_EVENT_LINKS) break;
    }
  }
  return links;
}

/**
 * 初詣シーズンの終了日（1月31日）を開始日から決める（純粋関数）。
 * 終了日「未定」のイベントに保存する endDate の算出と、終了日の
 * シーズン上限チェックに使う。
 * - 1月開始 → その年の1月31日
 * - それ以外（2〜12月）→ 翌年の1月31日（シーズンは年をまたぐ。
 *   11月など年内に準備を始めるイベントも、終了は翌年1月末）
 */
export function seasonEndDateFor(startDate: string): string {
  const year = Number(startDate.slice(0, 4));
  const month = Number(startDate.slice(5, 7));
  const endYear = month === 1 ? year : year + 1;
  return `${endYear}-01-31`;
}

/**
 * 年越しリセットの前倒し時刻（JST, 'HH:MM'）。
 * 1月1日分のリセット（12月31日までの蓄積を消すもの）は元日未明ではなく、
 * 12月31日のこの時刻に前倒しして実行する。年越しの参拝客が来る前に一度
 * リセットしておき、この時刻以降の登録を元日分として保持するため。
 */
export const NEW_YEAR_EARLY_RESET_TIME = '21:00';

/**
 * いま実行すべき日次リセットの「対象日付キー」を返す（純粋関数）。
 * 実行すべきでなければ null。isResetDue はこの関数の null 判定であり、
 * 実行側（lib/event-reset.ts）は完了時にこの日付キーを lastResetDate へ書く。
 *
 * スケジューラ（15分間隔）が各イベントについて呼ぶ前提:
 * - 開催中（status が live）で、リセット方式が「リセットしない」以外、
 *   手動終了の受付済みでないこと（手動終了時は終了処理が優先される）
 * - 対象日の分がまだ未実施（lastResetDate が対象日でない）こと
 *
 * 通常は「今日」が対象日。ただし年越しだけ例外で、12月31日の
 * NEW_YEAR_EARLY_RESET_TIME 以降は「翌年の1月1日」が対象日になる
 * （前倒し実行）。前倒しが実行されると lastResetDate が 1月1日になるため
 * 元日当日は二重に走らず、前倒しが走らなかった場合は元日に通常どおり
 * resetTime で実行される（フォールバック）。1月1日分のデータの消去は
 * 1月2日の resetTime に通常分として実行される。
 *
 * 冪等性は lastResetDate で担保する: 途中で失敗しても次の tick で再判定され、
 * 成功済みのイベントは二重にリセットされない。
 */
export function resetDateKeyFor(
  event: Pick<
    EventConfig,
    | 'startDate'
    | 'endDate'
    | 'resetMode'
    | 'resetTime'
    | 'lastResetDate'
    | 'status'
    | 'manualEndAt'
  >,
  now: Date,
): string | null {
  if (event.status !== 'live') return null;
  if (event.resetMode === 'none') return null;
  if (event.manualEndAt) return null;
  const today = jstDateString(now);

  // 年越しの前倒し: 12月31日の前倒し時刻以降は、翌1月1日分を先に実行する。
  // 12月31日分が未実施でも、消去自体は同じ蓄積を消すため前倒し分を優先する
  // （lastResetDate は 1月1日になり、12月31日分は別途走らない）。
  if (
    today.slice(5) === '12-31' &&
    today >= event.startDate &&
    jstTimeString(now) >= NEW_YEAR_EARLY_RESET_TIME
  ) {
    const nextJan1 = `${Number(today.slice(0, 4)) + 1}-01-01`;
    if (nextJan1 <= event.endDate && event.lastResetDate !== nextJan1) {
      return nextJan1;
    }
  }

  // 通常分: 開催期間内の今日が対象日で、設定時刻を過ぎていれば対象。
  if (today < event.startDate || today > event.endDate) return null;
  if (event.lastResetDate === today) return null;
  if (jstTimeString(now) < event.resetTime) return null;
  return today;
}

/** このイベントの日次リセットが実行すべき状態かどうか。 */
export function isResetDue(
  event: Pick<
    EventConfig,
    | 'startDate'
    | 'endDate'
    | 'resetMode'
    | 'resetTime'
    | 'lastResetDate'
    | 'status'
    | 'manualEndAt'
  >,
  now: Date,
): boolean {
  return resetDateKeyFor(event, now) !== null;
}

/**
 * 同時イベント上限のカウント対象かどうか。
 * 終了したイベントは数えない。手動終了を受け付けたイベント
 * （manualEndAt 設定済み）も、終了処理の完了を待たずに数えない
 * （終了を受け付けた時点で主催者は次のイベントを仕込める）。
 */
export function countsTowardConcurrentCap(
  event: Pick<EventConfig, 'status' | 'manualEndAt'>,
): boolean {
  return event.status !== 'ended' && !event.manualEndAt;
}

/** 主催者が現在仕込んでいるイベント数（下書き＋開催中。終了受付済みは除く）。 */
export function countConcurrentEvents(
  events: Pick<EventConfig, 'status' | 'manualEndAt'>[],
): number {
  return events.filter(countsTowardConcurrentCap).length;
}

/** 新しいイベントをもう1つ仕込めるかどうか（同時上限 MAX_CONCURRENT_EVENTS 未満）。 */
export function canCreateAnotherEvent(
  events: Pick<EventConfig, 'status' | 'manualEndAt'>[],
): boolean {
  return countConcurrentEvents(events) < MAX_CONCURRENT_EVENTS;
}

/**
 * 作成時に指定できる状態かどうかを検証し、正規化する（純粋関数・テスト対象）。
 * 未指定（undefined / null）は下書き。'ended' は作成時には選べない
 * （終了はスケジューラの終了処理でのみ遷移する）。
 * それ以外は例外を投げる（呼び出し側で 400 にする）。
 */
export function resolveCreateStatus(value: unknown): 'draft' | 'live' {
  if (value === undefined || value === null || value === 'draft') return 'draft';
  if (value === 'live') return 'live';
  throw new Error('状態の指定が不正です（下書きか開催中を指定してください）');
}

/**
 * 主催者がイベントを削除できるかどうか（純粋関数・テスト対象）。
 * 開催中は削除できない（先に終了させる運用）。削除できるのは
 * 下書きと、終了処理まで済んだ 'ended' のみ。
 */
export function canDeleteEvent(event: Pick<EventConfig, 'status'>): boolean {
  return event.status === 'draft' || event.status === 'ended';
}

/**
 * 契約枠の変更（プロビジョニング更新）を伝播してよいイベントかどうか。
 * 「終わった」イベント = 終了ステータス（'ended'）または終了処理完了
 * （finalizedAt 設定済み）。それ以外（下書き・開催中）は伝播対象で、
 * 終了済みのイベントの枠は履歴として触らない。
 */
export function receivesCapsPropagation(
  event: Pick<EventConfig, 'status' | 'finalizedAt'>,
): boolean {
  return event.status !== 'ended' && !event.finalizedAt;
}

/**
 * 終了処理（登録情報消去）の対象かどうか。
 * 終了日を過ぎていて、まだ finalized されていないイベントが対象。
 * 主催者が手動終了を受け付けたイベントは、日付に関係なく対象になる。
 * リセットより優先される（終了後にリセットは走らない）。
 */
export function isFinalizationDue(
  event: Pick<EventConfig, 'endDate' | 'finalizedAt' | 'manualEndAt'>,
  now: Date,
): boolean {
  if (event.finalizedAt) return false;
  if (event.manualEndAt) return true;
  return jstDateString(now) > event.endDate;
}

export type SubscriberUsageLevel = 'normal' | 'warning' | 'full';

/**
 * 購読者枠の使用状況（イベントカードのインジケーター用）。
 * percent は 0–100 に丸め、level は 90%以上で warning、上限到達で full。
 */
export function subscriberUsage(
  count: number,
  cap: number,
): { percent: number; level: SubscriberUsageLevel } {
  if (cap <= 0) return { percent: 0, level: 'normal' };
  const ratio = count / cap;
  const percent = Math.min(100, Math.round(ratio * 100));
  const level: SubscriberUsageLevel = ratio >= 1 ? 'full' : ratio >= 0.9 ? 'warning' : 'normal';
  return { percent, level };
}

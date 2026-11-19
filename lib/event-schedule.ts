// lib/event-schedule.ts
// 初詣の行事タイムテーブル（簡易版）: 神社が正月の行事予定
// （祭典・神楽・祈祷・授与所の時間など）を登録し、参拝者が
// 日時順の一覧で見られるようにする。1イベント・1リストの単純な形で、
// ステージ分けはしない（それは FES の仕事）。
//
// 置き場所: events/{eventId}/schedule（サブコレクション）。
// 日次リセットの対象には含めず（予定は複数日にまたがる）、
// シーズン終了時の終了処理で一緒に消去される（lib/event-reset.ts）。
// 文面（タイトル・場所・備考）は配信と同じく作成時に自動翻訳し、
// 言語別マップ（titleI18n 等）で一緒に保存する。
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { parseLocalizedTexts, type Locale } from './i18n';
import { sortScheduleEntries } from './schedule-view';
import { translateText } from './translate';

export const EVENT_SCHEDULE_COLLECTION = 'schedule';

/** 行事サブコレクション名（events/{eventId}/schedule）。 */
export const SCHEDULE_SUBCOLLECTION = 'schedule';

export interface EventScheduleEntry {
  id: string;
  title: string;
  titleI18n: Partial<Record<Locale, string>>;
  /** 行事の日（JST, 'YYYY-MM-DD'） */
  date: string;
  /** 開始時刻（'HH:MM'） */
  startTime: string;
  /** 終了時刻（'HH:MM'）。未設定は null */
  endTime: string | null;
  place: string;
  placeI18n: Partial<Record<Locale, string>>;
  note: string;
  noteI18n: Partial<Record<Locale, string>>;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleEntryInput {
  title: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  place?: string;
  note?: string;
}

const TITLE_MAX = 100;
const PLACE_MAX = 100;
const NOTE_MAX = 500;

/** 'YYYY-MM-DD' として実在する日付かどうか。 */
export function isValidScheduleDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** 'HH:MM'（00:00〜23:59）かどうか。 */
export function isValidScheduleTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export type ValidateScheduleResult =
  | { ok: true; value: Required<ScheduleEntryInput> }
  | { ok: false; error: string };

/**
 * 行事入力の検証と正規化（純粋関数）。
 * - タイトル必須（最大100字）、日付は実在する日、開始時刻は HH:MM
 * - 終了時刻は任意。指定する場合は開始より後であること
 * - 場所は最大100字、備考は最大500字（いずれも任意）
 */
export function validateScheduleEntryInput(
  input: ScheduleEntryInput,
): ValidateScheduleResult {
  const title = (input.title ?? '').trim();
  if (!title) return { ok: false, error: '行事名が必要です' };
  if (title.length > TITLE_MAX) {
    return { ok: false, error: `行事名は${TITLE_MAX}文字以内で入力してください` };
  }
  const date = (input.date ?? '').trim();
  if (!isValidScheduleDate(date)) {
    return { ok: false, error: '日付の形式が不正です' };
  }
  const startTime = (input.startTime ?? '').trim();
  if (!isValidScheduleTime(startTime)) {
    return { ok: false, error: '開始時刻の形式が不正です' };
  }
  const endTimeRaw = (input.endTime ?? '').trim();
  let endTime: string | null = null;
  if (endTimeRaw) {
    if (!isValidScheduleTime(endTimeRaw)) {
      return { ok: false, error: '終了時刻の形式が不正です' };
    }
    if (endTimeRaw <= startTime) {
      return { ok: false, error: '終了時刻は開始時刻より後にしてください' };
    }
    endTime = endTimeRaw;
  }
  const place = (input.place ?? '').trim();
  if (place.length > PLACE_MAX) {
    return { ok: false, error: `場所は${PLACE_MAX}文字以内で入力してください` };
  }
  const note = (input.note ?? '').trim();
  if (note.length > NOTE_MAX) {
    return { ok: false, error: `備考は${NOTE_MAX}文字以内で入力してください` };
  }
  return { ok: true, value: { title, date, startTime, endTime, place, note } };
}

// 並び替え・日付グループ化は表示用ヘルパー（lib/schedule-view.ts）に置き、
// 参拝者画面（クライアント）と共有する。ここでは再エクスポートする。
export {
  compareScheduleEntries,
  groupScheduleByDate,
  sortScheduleEntries,
  type ScheduleDateGroup,
} from './schedule-view';

function scheduleRef(eventId: string) {
  return db
    .collection('events')
    .doc(eventId)
    .collection(EVENT_SCHEDULE_COLLECTION);
}

function toScheduleEntry(
  doc: FirebaseFirestore.DocumentSnapshot,
): EventScheduleEntry {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    title: String(d.title ?? ''),
    titleI18n: parseLocalizedTexts(d.titleI18n),
    date: String(d.date ?? ''),
    startTime: String(d.startTime ?? ''),
    endTime: typeof d.endTime === 'string' && d.endTime ? d.endTime : null,
    place: String(d.place ?? ''),
    placeI18n: parseLocalizedTexts(d.placeI18n),
    note: String(d.note ?? ''),
    noteI18n: parseLocalizedTexts(d.noteI18n),
    createdAt: d.createdAt?.toDate?.().toISOString() ?? '',
    updatedAt: d.updatedAt?.toDate?.().toISOString() ?? '',
  };
}

/** 行事一覧（日時順）。 */
export async function listScheduleEntries(
  eventId: string,
): Promise<EventScheduleEntry[]> {
  const snap = await scheduleRef(eventId).get();
  return sortScheduleEntries(snap.docs.map(toScheduleEntry));
}

export async function getScheduleEntry(
  eventId: string,
  entryId: string,
): Promise<EventScheduleEntry | null> {
  const doc = await scheduleRef(eventId).doc(entryId).get();
  return doc.exists ? toScheduleEntry(doc) : null;
}

/** 文面3点の自動翻訳を揃える（空文は翻訳しない）。 */
async function translateEntryTexts(value: Required<ScheduleEntryInput>) {
  const [titleI18n, placeI18n, noteI18n] = await Promise.all([
    translateText(value.title),
    value.place ? translateText(value.place) : Promise.resolve({}),
    value.note ? translateText(value.note) : Promise.resolve({}),
  ]);
  return { titleI18n, placeI18n, noteI18n };
}

/** 行事を登録する。入力は検証済みであること（検証は呼び出し側でも行う）。 */
export async function createScheduleEntry(
  eventId: string,
  input: ScheduleEntryInput,
): Promise<EventScheduleEntry> {
  const validated = validateScheduleEntryInput(input);
  if (!validated.ok) throw new Error(validated.error);
  const value = validated.value;
  const i18n = await translateEntryTexts(value);
  const ref = scheduleRef(eventId).doc();
  await ref.set({
    title: value.title,
    ...i18n,
    date: value.date,
    startTime: value.startTime,
    endTime: value.endTime,
    place: value.place,
    note: value.note,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const created = await ref.get();
  return toScheduleEntry(created);
}

/** 行事を更新する。無ければ例外。 */
export async function updateScheduleEntry(
  eventId: string,
  entryId: string,
  input: ScheduleEntryInput,
): Promise<EventScheduleEntry> {
  const validated = validateScheduleEntryInput(input);
  if (!validated.ok) throw new Error(validated.error);
  const ref = scheduleRef(eventId).doc(entryId);
  const existing = await ref.get();
  if (!existing.exists) throw new Error('行事が見つかりません');
  const value = validated.value;
  const i18n = await translateEntryTexts(value);
  await ref.update({
    title: value.title,
    ...i18n,
    date: value.date,
    startTime: value.startTime,
    endTime: value.endTime,
    place: value.place,
    note: value.note,
    updatedAt: FieldValue.serverTimestamp(),
  });
  const updated = await ref.get();
  return toScheduleEntry(updated);
}

/** 行事を削除する。存在しなかった場合は false。 */
export async function deleteScheduleEntry(
  eventId: string,
  entryId: string,
): Promise<boolean> {
  const ref = scheduleRef(eventId).doc(entryId);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

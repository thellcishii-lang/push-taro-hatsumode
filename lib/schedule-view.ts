// lib/schedule-view.ts
// 行事タイムテーブルの表示用ヘルパー（純粋関数のみ・クライアントからも使える）。
// データの読み書きは lib/event-schedule.ts（サーバー側）が担い、
// 並び替えと日付グループ化はここに置いて画面と共有する。

/** 並び替え・グループ化に必要な最小の形。 */
export interface ScheduleEntryLike {
  date: string;
  startTime: string;
  title: string;
}

/** 表示順: 日付 → 開始時刻 → 行事名（純粋関数）。 */
export function compareScheduleEntries(
  a: ScheduleEntryLike,
  b: ScheduleEntryLike,
): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
  return a.title.localeCompare(b.title, 'ja');
}

export function sortScheduleEntries<T extends ScheduleEntryLike>(entries: T[]): T[] {
  return [...entries].sort(compareScheduleEntries);
}

export interface ScheduleDateGroup<T> {
  date: string;
  entries: T[];
}

/** 日付ごとにグループ化する（グループも中身も日時順。純粋関数）。 */
export function groupScheduleByDate<T extends ScheduleEntryLike>(
  entries: T[],
): ScheduleDateGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const entry of sortScheduleEntries(entries)) {
    const list = groups.get(entry.date) ?? [];
    list.push(entry);
    groups.set(entry.date, list);
  }
  return [...groups.entries()].map(([date, list]) => ({ date, entries: list }));
}

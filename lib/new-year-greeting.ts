// lib/new-year-greeting.ts
// 元日の羊の挨拶オーバーレイの表示判定（純粋関数・クライアントから使う）。
//
// 仕様（2026-11-18 決定）:
// - 表示は1月1日（端末の現地時間）のみ。その日の初回起動でだけ出す。
// - 1月2日以降に初めて開いた端末には出さない。
// - 表示済みフラグは端末側（localStorage）にだけ持つ。サーバー側の
//   日次リセットに巻き込まれないための意図的な分離。

/** 表示済みフラグの保存キー（年ごとに分ける）。 */
export function newYearGreetingStorageKey(year: number): string {
  return `hatsumode-new-year-greeting:${year}`;
}

/** 端末の現地時間で1月1日かどうか。 */
export function isNewYearDay(now: Date): boolean {
  return now.getMonth() === 0 && now.getDate() === 1;
}

export interface GreetingStorage {
  getItem(key: string): string | null;
}

/**
 * 羊の挨拶を出すべきかどうか。
 * 1月1日であり、その年のフラグが端末に立っていない場合だけ true。
 * storage が読めない環境では安全側に倒して false（挨拶なしで通常画面へ）。
 */
export function shouldShowNewYearGreeting(
  now: Date,
  storage: GreetingStorage | null,
): boolean {
  if (!isNewYearDay(now)) return false;
  if (!storage) return false;
  try {
    return storage.getItem(newYearGreetingStorageKey(now.getFullYear())) !== 'shown';
  } catch {
    return false;
  }
}

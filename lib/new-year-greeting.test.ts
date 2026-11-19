// lib/new-year-greeting.test.ts
import { describe, expect, it } from 'vitest';
import {
  isNewYearDay,
  newYearGreetingStorageKey,
  shouldShowNewYearGreeting,
} from './new-year-greeting';

function storageWith(values: Record<string, string>) {
  return {
    getItem: (key: string) => values[key] ?? null,
  };
}

describe('isNewYearDay', () => {
  it('現地時間で1月1日だけ true', () => {
    expect(isNewYearDay(new Date(2027, 0, 1, 0, 0))).toBe(true);
    expect(isNewYearDay(new Date(2027, 0, 1, 23, 59))).toBe(true);
    expect(isNewYearDay(new Date(2026, 11, 31, 23, 59))).toBe(false);
    expect(isNewYearDay(new Date(2027, 0, 2, 0, 0))).toBe(false);
  });
});

describe('shouldShowNewYearGreeting', () => {
  const jan1 = new Date(2027, 0, 1, 9, 0);

  it('1月1日で未表示なら出す', () => {
    expect(shouldShowNewYearGreeting(jan1, storageWith({}))).toBe(true);
  });

  it('1月1日でも表示済みフラグがあれば出さない', () => {
    const storage = storageWith({ [newYearGreetingStorageKey(2027)]: 'shown' });
    expect(shouldShowNewYearGreeting(jan1, storage)).toBe(false);
  });

  it('前年のフラグは今年の判定に影響しない', () => {
    const storage = storageWith({ [newYearGreetingStorageKey(2026)]: 'shown' });
    expect(shouldShowNewYearGreeting(jan1, storage)).toBe(true);
  });

  it('1月2日以降は未表示でも出さない', () => {
    expect(shouldShowNewYearGreeting(new Date(2027, 0, 2, 9, 0), storageWith({}))).toBe(false);
    expect(shouldShowNewYearGreeting(new Date(2027, 0, 15, 9, 0), storageWith({}))).toBe(false);
  });

  it('12月31日は出さない', () => {
    expect(shouldShowNewYearGreeting(new Date(2026, 11, 31, 23, 30), storageWith({}))).toBe(false);
  });

  it('storage が無い・読めない場合は出さない（安全側）', () => {
    expect(shouldShowNewYearGreeting(jan1, null)).toBe(false);
    expect(
      shouldShowNewYearGreeting(jan1, {
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toBe(false);
  });
});

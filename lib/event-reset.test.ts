import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DELETE_BUDGET,
  EVENT_SUBCOLLECTIONS,
  groupSubscriberTokensByLocale,
  resetTargets,
  resolveDeleteBudget,
} from './event-reset';

describe('resetTargets', () => {
  it('方式A（full-daily）の日次リセットは全サブコレクションを消す', () => {
    expect(resetTargets('full-daily', 'daily')).toEqual([
      EVENT_SUBCOLLECTIONS.subscribers,
      EVENT_SUBCOLLECTIONS.members,
      EVENT_SUBCOLLECTIONS.claims,
      EVENT_SUBCOLLECTIONS.redemptions,
    ]);
  });

  it('方式B（keep-phones）の日次リセットは購読だけを消し、端末情報と記録は保持する', () => {
    expect(resetTargets('keep-phones', 'daily')).toEqual([
      EVENT_SUBCOLLECTIONS.subscribers,
    ]);
  });

  it('リセットしない方式（none）の日次リセットは対象が無い（消去は終了処理でのみ）', () => {
    expect(resetTargets('none', 'daily')).toEqual([]);
  });

  it('終了処理は方式によらず全サブコレクションを消す（登録情報消去）', () => {
    const all = [
      EVENT_SUBCOLLECTIONS.subscribers,
      EVENT_SUBCOLLECTIONS.members,
      EVENT_SUBCOLLECTIONS.claims,
      EVENT_SUBCOLLECTIONS.redemptions,
    ];
    expect(resetTargets('full-daily', 'finalize')).toEqual(all);
    expect(resetTargets('keep-phones', 'finalize')).toEqual(all);
    expect(resetTargets('none', 'finalize')).toEqual(all);
  });
});

describe('resolveDeleteBudget', () => {
  const ORIGINAL = process.env.EVENT_RESET_DELETE_BUDGET;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.EVENT_RESET_DELETE_BUDGET;
    else process.env.EVENT_RESET_DELETE_BUDGET = ORIGINAL;
  });

  it('明示指定が最優先', () => {
    process.env.EVENT_RESET_DELETE_BUDGET = '5000';
    expect(resolveDeleteBudget(123)).toBe(123);
  });

  it('環境変数があればそれを使う', () => {
    process.env.EVENT_RESET_DELETE_BUDGET = '5000';
    expect(resolveDeleteBudget()).toBe(5000);
  });

  it('環境変数が無ければ既定値（初詣規模向けに 100,000）', () => {
    delete process.env.EVENT_RESET_DELETE_BUDGET;
    expect(DEFAULT_DELETE_BUDGET).toBe(100_000);
    expect(resolveDeleteBudget()).toBe(100_000);
  });

  it('環境変数が不正なら既定値に倒す', () => {
    process.env.EVENT_RESET_DELETE_BUDGET = 'abc';
    expect(resolveDeleteBudget()).toBe(DEFAULT_DELETE_BUDGET);
    process.env.EVENT_RESET_DELETE_BUDGET = '-5';
    expect(resolveDeleteBudget()).toBe(DEFAULT_DELETE_BUDGET);
    process.env.EVENT_RESET_DELETE_BUDGET = '0';
    expect(resolveDeleteBudget()).toBe(DEFAULT_DELETE_BUDGET);
  });
});

describe('groupSubscriberTokensByLocale', () => {
  it('トークンを言語ごとに分ける', () => {
    const byLocale = groupSubscriberTokensByLocale([
      { fcmToken: 'tok-ja-1', lang: 'ja' },
      { fcmToken: 'tok-en-1', lang: 'en' },
      { fcmToken: 'tok-ja-2', lang: 'ja' },
    ]);
    expect(byLocale.get('ja')).toEqual(['tok-ja-1', 'tok-ja-2']);
    expect(byLocale.get('en')).toEqual(['tok-en-1']);
    expect(byLocale.size).toBe(2);
  });

  it('トークンの無いドキュメントは対象外にする', () => {
    const byLocale = groupSubscriberTokensByLocale([
      { lang: 'ja' },
      { fcmToken: '', lang: 'ja' },
      { fcmToken: 123, lang: 'ja' },
      { fcmToken: 'tok-1', lang: 'ja' },
    ]);
    expect(byLocale.get('ja')).toEqual(['tok-1']);
    expect(byLocale.size).toBe(1);
  });

  it('言語が無い・不正なドキュメントは既定言語（ja）に寄せる', () => {
    const byLocale = groupSubscriberTokensByLocale([
      { fcmToken: 'tok-1' },
      { fcmToken: 'tok-2', lang: 'fr' },
    ]);
    expect(byLocale.get('ja')).toEqual(['tok-1', 'tok-2']);
  });

  it('空入力では空の Map を返す', () => {
    expect(groupSubscriberTokensByLocale([]).size).toBe(0);
  });
});

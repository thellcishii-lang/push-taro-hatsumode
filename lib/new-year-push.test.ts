// lib/new-year-push.test.ts
import { describe, expect, it } from 'vitest';
import {
  NEW_YEAR_PUSH_TEXTS,
  isNewYearPushDue,
} from './new-year-push';

// JST 2027-01-01 00:00 = UTC 2026-12-31 15:00
const JAN1_0000_JST = new Date('2026-12-31T15:00:00Z');
const JAN1_0030_JST = new Date('2026-12-31T15:30:00Z');
const JAN1_0100_JST = new Date('2026-12-31T16:00:00Z');
const DEC31_2345_JST = new Date('2026-12-31T14:45:00Z');
const JAN2_0000_JST = new Date('2027-01-01T15:00:00Z');

const baseEvent = {
  status: 'live' as const,
  newYearPushEnabled: true,
  newYearPushSentYear: undefined,
};

describe('isNewYearPushDue', () => {
  it('1月1日0時台の開催中イベントは対象', () => {
    expect(isNewYearPushDue(baseEvent, JAN1_0000_JST)).toBe(true);
    expect(isNewYearPushDue(baseEvent, JAN1_0030_JST)).toBe(true);
  });

  it('0時台を過ぎたら送らない', () => {
    expect(isNewYearPushDue(baseEvent, JAN1_0100_JST)).toBe(false);
  });

  it('12月31日や1月2日は送らない', () => {
    expect(isNewYearPushDue(baseEvent, DEC31_2345_JST)).toBe(false);
    expect(isNewYearPushDue(baseEvent, JAN2_0000_JST)).toBe(false);
  });

  it('オフにしているイベントには送らない', () => {
    expect(
      isNewYearPushDue(
        { ...baseEvent, newYearPushEnabled: false },
        JAN1_0000_JST,
      ),
    ).toBe(false);
  });

  it('開催中でなければ送らない', () => {
    expect(
      isNewYearPushDue({ ...baseEvent, status: 'draft' }, JAN1_0000_JST),
    ).toBe(false);
    expect(
      isNewYearPushDue({ ...baseEvent, status: 'ended' }, JAN1_0000_JST),
    ).toBe(false);
  });

  it('その年に送り済みなら送らない（翌年はまた送る）', () => {
    expect(
      isNewYearPushDue(
        { ...baseEvent, newYearPushSentYear: 2027 },
        JAN1_0000_JST,
      ),
    ).toBe(false);
    expect(
      isNewYearPushDue(
        { ...baseEvent, newYearPushSentYear: 2026 },
        JAN1_0000_JST,
      ),
    ).toBe(true);
  });
});

describe('NEW_YEAR_PUSH_TEXTS', () => {
  it('4言語すべてにタイトルと本文が入っている', () => {
    for (const locale of ['ja', 'en', 'zh', 'ko'] as const) {
      expect(NEW_YEAR_PUSH_TEXTS[locale].title.length).toBeGreaterThan(0);
      expect(NEW_YEAR_PUSH_TEXTS[locale].body.length).toBeGreaterThan(0);
    }
    expect(NEW_YEAR_PUSH_TEXTS.ja.title).toBe('あけましておめでとうございます');
  });
});

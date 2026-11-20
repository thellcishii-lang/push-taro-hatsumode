// lib/event-register.test.ts
import { describe, expect, it } from 'vitest';
import { evaluateRegistration } from './event-register';
import { memberIdForDevice } from './event-coupon';

const baseEvent = {
  status: 'live' as const,
  startDate: '2026-11-07',
  endDate: '2026-11-09',
  manualEndAt: null as string | null,
};

describe('memberIdForDevice', () => {
  it('同じ端末からは同じIDが得られる', () => {
    expect(memberIdForDevice('anon-uid-1')).toBe(memberIdForDevice('anon-uid-1'));
  });
  it('異なる端末では異なるIDになる', () => {
    expect(memberIdForDevice('anon-uid-1')).not.toBe(memberIdForDevice('anon-uid-2'));
  });
  it('端末の識別子そのものはIDに含まれない', () => {
    expect(memberIdForDevice('anon-uid-1')).not.toContain('anon-uid-1');
  });
});

describe('evaluateRegistration', () => {
  it('開催期間内の live イベントは登録できる', () => {
    expect(evaluateRegistration(baseEvent, '2026-11-08')).toEqual({ allowed: true });
  });
  it('初日と最終日も登録できる', () => {
    expect(evaluateRegistration(baseEvent, '2026-11-07')).toEqual({ allowed: true });
    expect(evaluateRegistration(baseEvent, '2026-11-09')).toEqual({ allowed: true });
  });
  it('下書き状態では登録できない', () => {
    expect(evaluateRegistration({ ...baseEvent, status: 'draft' }, '2026-11-08'))
      .toEqual({ allowed: false, reason: 'not-live' });
  });
  it('開催前は登録できない', () => {
    expect(evaluateRegistration(baseEvent, '2026-11-06'))
      .toEqual({ allowed: false, reason: 'before-period' });
  });
  it('終了後は登録できない', () => {
    expect(evaluateRegistration(baseEvent, '2026-11-10'))
      .toEqual({ allowed: false, reason: 'after-period' });
  });
  it('手動終了を受け付けたイベントは期間内でも登録できない', () => {
    expect(
      evaluateRegistration(
        { ...baseEvent, manualEndAt: '2026-11-08T01:00:00.000Z' },
        '2026-11-08',
      ),
    ).toEqual({ allowed: false, reason: 'after-period' });
  });
  it('登録可否に登録者数の入力自体が無い（初詣は登録上限なし）', () => {
    // 契約枠（subscriberCap）は料金段階のデータとして保持するだけで、
    // evaluateRegistration は枠も現在の登録者数も受け取らない。
    expect(evaluateRegistration.length).toBe(2);
  });
});

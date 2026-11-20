import { describe, expect, it } from 'vitest';
import {
  EventConfig,
  MAX_CONCURRENT_EVENTS,
  NEW_YEAR_EARLY_RESET_TIME,
  canCreateAnotherEvent,
  canDeleteEvent,
  countConcurrentEvents,
  countsTowardConcurrentCap,
  isFinalizationDue,
  isResetDue,
  isValidResetTime,
  receivesCapsPropagation,
  resetDateKeyFor,
  resolveCreateStatus,
  seasonEndDateFor,
  subscriberUsage,
  jstDateString,
  jstTimeString,
} from './event';

const baseEvent: Pick<
  EventConfig,
  | 'startDate'
  | 'endDate'
  | 'resetMode'
  | 'resetTime'
  | 'lastResetDate'
  | 'status'
  | 'manualEndAt'
> = {
  startDate: '2026-11-07',
  endDate: '2026-11-08',
  resetMode: 'full-daily',
  resetTime: '00:00',
  lastResetDate: null,
  status: 'live',
  manualEndAt: null,
};

// JST 2026-11-07 00:30 の Date（UTC では前日 15:30）
const jst = (isoUtc: string) => new Date(isoUtc);

describe('jstDateString / jstTimeString', () => {
  it('UTC 15:30 は JST 翌日 00:30 として扱う', () => {
    const d = jst('2026-11-06T15:30:00Z');
    expect(jstDateString(d)).toBe('2026-11-07');
    expect(jstTimeString(d)).toBe('00:30');
  });
});

describe('isValidResetTime', () => {
  it('正常系', () => {
    expect(isValidResetTime('00:00')).toBe(true);
    expect(isValidResetTime('04:30')).toBe(true);
    expect(isValidResetTime('23:59')).toBe(true);
  });
  it('異常系', () => {
    expect(isValidResetTime('24:00')).toBe(false);
    expect(isValidResetTime('9:00')).toBe(false);
    expect(isValidResetTime('00:60')).toBe(false);
  });
});

describe('isResetDue', () => {
  it('開催初日、設定時刻を過ぎていれば due', () => {
    expect(isResetDue(baseEvent, jst('2026-11-06T15:30:00Z'))).toBe(true);
  });

  it('設定時刻より前なら not due（夜間イベント想定: resetTime 04:00）', () => {
    const night = { ...baseEvent, resetTime: '04:00' };
    // JST 03:00
    expect(isResetDue(night, jst('2026-11-06T18:00:00Z'))).toBe(false);
    // JST 04:00 ちょうど
    expect(isResetDue(night, jst('2026-11-06T19:00:00Z'))).toBe(true);
  });

  it('今日分が実施済みなら not due（二重実行防止）', () => {
    const done = { ...baseEvent, lastResetDate: '2026-11-07' };
    expect(isResetDue(done, jst('2026-11-06T15:30:00Z'))).toBe(false);
  });

  it('開催期間外は not due', () => {
    // JST 2026-11-06（開始前）
    expect(isResetDue(baseEvent, jst('2026-11-05T15:30:00Z'))).toBe(false);
    // JST 2026-11-09（終了後）
    expect(isResetDue(baseEvent, jst('2026-11-08T15:30:00Z'))).toBe(false);
  });

  it('live でなければ not due', () => {
    expect(
      isResetDue({ ...baseEvent, status: 'draft' }, jst('2026-11-06T15:30:00Z')),
    ).toBe(false);
  });

  it('リセットしない方式（none）は常に対象外', () => {
    const none = { ...baseEvent, resetMode: 'none' as const };
    expect(isResetDue(none, jst('2026-11-06T15:30:00Z'))).toBe(false);
    expect(resetDateKeyFor(none, jst('2026-11-06T15:30:00Z'))).toBeNull();
  });

  it('手動終了を受け付けたイベントはリセット対象外（終了処理が優先）', () => {
    const ending = { ...baseEvent, manualEndAt: '2026-11-07T01:00:00.000Z' };
    expect(isResetDue(ending, jst('2026-11-06T15:30:00Z'))).toBe(false);
    expect(resetDateKeyFor(ending, jst('2026-11-06T15:30:00Z'))).toBeNull();
  });

  it('通常日は対象日キーとして今日が返る', () => {
    expect(resetDateKeyFor(baseEvent, jst('2026-11-06T15:30:00Z'))).toBe(
      '2026-11-07',
    );
  });
});

describe('年越しリセットの前倒し（12月31日 21:00）', () => {
  // 12月31日分まで実施済みのシーズンイベント
  const seasonEvent: typeof baseEvent = {
    startDate: '2026-12-28',
    endDate: '2027-01-31',
    resetMode: 'full-daily',
    resetTime: '00:00',
    lastResetDate: '2026-12-31',
    status: 'live',
    manualEndAt: null,
  };

  it('前倒し時刻は 21:00', () => {
    expect(NEW_YEAR_EARLY_RESET_TIME).toBe('21:00');
  });

  it('12月31日 20:59 では前倒し分は due でない', () => {
    // JST 2026-12-31 20:59 = UTC 11:59
    const now = jst('2026-12-31T11:59:00Z');
    expect(resetDateKeyFor(seasonEvent, now)).toBeNull();
    expect(isResetDue(seasonEvent, now)).toBe(false);
  });

  it('12月31日 21:00 で due になり、対象日は翌年の1月1日', () => {
    // JST 2026-12-31 21:00 = UTC 12:00
    const now = jst('2026-12-31T12:00:00Z');
    expect(resetDateKeyFor(seasonEvent, now)).toBe('2027-01-01');
    expect(isResetDue(seasonEvent, now)).toBe(true);
  });

  it('12月31日分が未実施でも、前倒し時刻以降は1月1日分が優先される', () => {
    const pending = { ...seasonEvent, lastResetDate: '2026-12-30' };
    // JST 2026-12-31 21:00
    expect(resetDateKeyFor(pending, jst('2026-12-31T12:00:00Z'))).toBe(
      '2027-01-01',
    );
    // 前倒し時刻より前なら通常どおり12月31日分が対象
    // JST 2026-12-31 00:30 = UTC 2026-12-30 15:30
    expect(resetDateKeyFor(pending, jst('2026-12-30T15:30:00Z'))).toBe(
      '2026-12-31',
    );
  });

  it('前倒し実行後（lastResetDate が1月1日）は元日 0:00 でも 4:00 でも due でない', () => {
    const done = { ...seasonEvent, lastResetDate: '2027-01-01' };
    // JST 2027-01-01 00:30
    expect(isResetDue(done, jst('2026-12-31T15:30:00Z'))).toBe(false);
    // JST 2027-01-01 04:00
    expect(isResetDue(done, jst('2026-12-31T19:00:00Z'))).toBe(false);
    expect(resetDateKeyFor(done, jst('2026-12-31T19:00:00Z'))).toBeNull();
  });

  it('前倒しが走らなかった場合は、元日に通常どおり resetTime で due（時刻の下限ずらしは無い）', () => {
    // lastResetDate は12月31日のまま。元日 00:30（resetTime 00:00 を過ぎた）で due
    expect(resetDateKeyFor(seasonEvent, jst('2026-12-31T15:30:00Z'))).toBe(
      '2027-01-01',
    );
    expect(isResetDue(seasonEvent, jst('2026-12-31T15:30:00Z'))).toBe(true);
  });

  it('元日も resetTime の設定どおりに判定する', () => {
    const late = { ...seasonEvent, resetTime: '05:00' };
    // JST 2027-01-01 04:30 → まだ
    expect(isResetDue(late, jst('2026-12-31T19:30:00Z'))).toBe(false);
    // JST 2027-01-01 05:00 → due
    expect(isResetDue(late, jst('2026-12-31T20:00:00Z'))).toBe(true);
  });

  it('1月1日分のデータは1月2日の resetTime に通常 due', () => {
    const jan1Done = { ...seasonEvent, lastResetDate: '2027-01-01' };
    // JST 2027-01-02 00:30
    expect(resetDateKeyFor(jan1Done, jst('2027-01-01T15:30:00Z'))).toBe(
      '2027-01-02',
    );
    expect(isResetDue(jan1Done, jst('2027-01-01T15:30:00Z'))).toBe(true);
  });

  it('リセットしない方式（none）では前倒しも due でない', () => {
    const none = { ...seasonEvent, resetMode: 'none' as const };
    // JST 2026-12-31 21:00
    expect(resetDateKeyFor(none, jst('2026-12-31T12:00:00Z'))).toBeNull();
    expect(isResetDue(none, jst('2026-12-31T12:00:00Z'))).toBe(false);
  });

  it('手動終了を受け付けたイベントでは前倒しも due でない', () => {
    const ending = {
      ...seasonEvent,
      manualEndAt: '2026-12-31T10:00:00.000Z',
    };
    // JST 2026-12-31 21:00
    expect(resetDateKeyFor(ending, jst('2026-12-31T12:00:00Z'))).toBeNull();
    expect(isResetDue(ending, jst('2026-12-31T12:00:00Z'))).toBe(false);
  });

  it('1月1日が開催期間外（endDate が12月31日）なら前倒しせず、通常分が対象', () => {
    const endsDec31 = {
      ...seasonEvent,
      endDate: '2026-12-31',
      lastResetDate: '2026-12-30',
    };
    // JST 2026-12-31 21:00 → 対象は12月31日分
    expect(resetDateKeyFor(endsDec31, jst('2026-12-31T12:00:00Z'))).toBe(
      '2026-12-31',
    );
  });
});

describe('seasonEndDateFor（終了日未定の保存値）', () => {
  it('12月開始は翌年の1月31日', () => {
    expect(seasonEndDateFor('2026-12-01')).toBe('2027-01-31');
    expect(seasonEndDateFor('2026-12-31')).toBe('2027-01-31');
  });

  it('1月開始はその年の1月31日', () => {
    expect(seasonEndDateFor('2027-01-01')).toBe('2027-01-31');
    expect(seasonEndDateFor('2027-01-15')).toBe('2027-01-31');
  });

  it('シーズン外はその年の1月31日に倒す（安全側）', () => {
    expect(seasonEndDateFor('2026-11-20')).toBe('2026-01-31');
  });
});

describe('isFinalizationDue', () => {
  const fin = {
    endDate: '2026-11-08',
    finalizedAt: null as string | null,
    manualEndAt: null as string | null,
  };
  it('終了日の翌日以降で due', () => {
    // JST 2026-11-09
    expect(isFinalizationDue(fin, jst('2026-11-08T15:00:00Z'))).toBe(true);
  });
  it('終了日当日は not due', () => {
    // JST 2026-11-08
    expect(isFinalizationDue(fin, jst('2026-11-07T15:00:00Z'))).toBe(false);
  });
  it('finalized 済みなら not due', () => {
    expect(
      isFinalizationDue(
        { ...fin, finalizedAt: '2026-11-09T00:00:00.000Z' },
        jst('2026-11-08T15:00:00Z'),
      ),
    ).toBe(false);
  });
  it('手動終了を受け付けたら、終了日前でも due', () => {
    const manual = { ...fin, manualEndAt: '2026-11-07T01:00:00.000Z' };
    // JST 2026-11-07（開催期間中）
    expect(isFinalizationDue(manual, jst('2026-11-06T15:00:00Z'))).toBe(true);
  });
  it('手動終了を受け付けていても finalized 済みなら not due', () => {
    const manualDone = {
      ...fin,
      manualEndAt: '2026-11-07T01:00:00.000Z',
      finalizedAt: '2026-11-07T02:00:00.000Z',
    };
    expect(isFinalizationDue(manualDone, jst('2026-11-06T15:00:00Z'))).toBe(
      false,
    );
  });
});

describe('同時イベント上限（MAX_CONCURRENT_EVENTS）', () => {
  const ev = (
    status: EventConfig['status'],
    manualEndAt: string | null = null,
  ) => ({ status, manualEndAt });

  it('上限は3', () => {
    expect(MAX_CONCURRENT_EVENTS).toBe(3);
  });

  it('終了したイベントは数えない', () => {
    expect(countsTowardConcurrentCap(ev('draft'))).toBe(true);
    expect(countsTowardConcurrentCap(ev('live'))).toBe(true);
    expect(countsTowardConcurrentCap(ev('ended'))).toBe(false);
    expect(
      countConcurrentEvents([ev('live'), ev('ended'), ev('draft'), ev('ended')]),
    ).toBe(2);
  });

  it('終了受付済み（manualEndAt あり）のイベントは終了処理の完了を待たずに数えない', () => {
    const endedAt = '2026-12-31T03:00:00.000Z';
    expect(countsTowardConcurrentCap(ev('live', endedAt))).toBe(false);
    expect(
      countConcurrentEvents([ev('live'), ev('live', endedAt), ev('draft')]),
    ).toBe(2);
    // 開催中2件＋終了受付済み1件なら、枠は2件分なのでもう1件作れる
    expect(
      canCreateAnotherEvent([ev('live'), ev('live'), ev('live', endedAt)]),
    ).toBe(true);
  });

  it('イベントが無ければ作成できる', () => {
    expect(canCreateAnotherEvent([])).toBe(true);
  });

  it('下書き＋開催中が上限未満なら作成できる（終了分は含めない）', () => {
    expect(
      canCreateAnotherEvent([ev('draft'), ev('live'), ev('ended'), ev('ended')]),
    ).toBe(true);
  });

  it('下書き＋開催中が上限に達したら作成できない', () => {
    expect(canCreateAnotherEvent([ev('draft'), ev('live'), ev('draft')])).toBe(
      false,
    );
    expect(
      canCreateAnotherEvent([ev('live'), ev('live'), ev('live'), ev('ended')]),
    ).toBe(false);
  });
});

describe('枠伝播の対象（receivesCapsPropagation）', () => {
  const ev = (status: EventConfig['status'], finalizedAt: string | null = null) => ({
    status,
    finalizedAt,
  });

  it('下書き・開催中は伝播対象', () => {
    expect(receivesCapsPropagation(ev('draft'))).toBe(true);
    expect(receivesCapsPropagation(ev('live'))).toBe(true);
  });

  it('終了したイベントは対象外（枠は履歴として触らない）', () => {
    expect(receivesCapsPropagation(ev('ended'))).toBe(false);
  });

  it('終了処理が完了したイベントはステータスによらず対象外', () => {
    expect(receivesCapsPropagation(ev('live', '2026-11-09T00:00:00.000Z'))).toBe(false);
    expect(receivesCapsPropagation(ev('draft', '2026-11-09T00:00:00.000Z'))).toBe(false);
  });
});

describe('作成時の状態指定（resolveCreateStatus）', () => {
  it('未指定は下書き', () => {
    expect(resolveCreateStatus(undefined)).toBe('draft');
    expect(resolveCreateStatus(null)).toBe('draft');
  });

  it('下書き・開催中はそのまま通す', () => {
    expect(resolveCreateStatus('draft')).toBe('draft');
    expect(resolveCreateStatus('live')).toBe('live');
  });

  it('終了や不正な値は例外（作成時には選べない）', () => {
    expect(() => resolveCreateStatus('ended')).toThrow();
    expect(() => resolveCreateStatus('published')).toThrow();
    expect(() => resolveCreateStatus(1)).toThrow();
    expect(() => resolveCreateStatus({})).toThrow();
  });
});

describe('削除できるイベント（canDeleteEvent）', () => {
  const ev = (status: EventConfig['status']) => ({ status });

  it('下書きと終了は削除できる', () => {
    expect(canDeleteEvent(ev('draft'))).toBe(true);
    expect(canDeleteEvent(ev('ended'))).toBe(true);
  });

  it('開催中は削除できない（先に終了させる運用）', () => {
    expect(canDeleteEvent(ev('live'))).toBe(false);
  });
});

describe('subscriberUsage', () => {
  it('通常域は percent を丸めて normal', () => {
    expect(subscriberUsage(250, 1000)).toEqual({ percent: 25, level: 'normal' });
    expect(subscriberUsage(0, 50000)).toEqual({ percent: 0, level: 'normal' });
  });

  it('90%以上で warning', () => {
    expect(subscriberUsage(900, 1000)).toEqual({ percent: 90, level: 'warning' });
    expect(subscriberUsage(899, 1000).level).toBe('normal');
  });

  it('上限到達で full、percent は 100 で頭打ち', () => {
    expect(subscriberUsage(1000, 1000)).toEqual({ percent: 100, level: 'full' });
    expect(subscriberUsage(1500, 1000)).toEqual({ percent: 100, level: 'full' });
  });

  it('枠が 0 以下なら 0% normal', () => {
    expect(subscriberUsage(10, 0)).toEqual({ percent: 0, level: 'normal' });
  });
});

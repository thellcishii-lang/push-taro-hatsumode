// lib/event-schedule.test.ts
import { describe, expect, it } from 'vitest';
import {
  groupScheduleByDate,
  isValidScheduleDate,
  isValidScheduleTime,
  sortScheduleEntries,
  validateScheduleEntryInput,
  type EventScheduleEntry,
} from './event-schedule';

function entry(partial: Partial<EventScheduleEntry>): EventScheduleEntry {
  return {
    id: 'x',
    title: '行事',
    titleI18n: {},
    date: '2027-01-01',
    startTime: '10:00',
    endTime: null,
    place: '',
    placeI18n: {},
    note: '',
    noteI18n: {},
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('validateScheduleEntryInput', () => {
  const base = { title: '元旦祭', date: '2027-01-01', startTime: '00:00' };

  it('最小入力を通し、任意項目を空に正規化する', () => {
    const result = validateScheduleEntryInput(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      title: '元旦祭',
      date: '2027-01-01',
      startTime: '00:00',
      endTime: null,
      place: '',
      note: '',
    });
  });

  it('タイトルが空ならエラー', () => {
    expect(validateScheduleEntryInput({ ...base, title: '  ' }).ok).toBe(false);
  });

  it('実在しない日付・形式違いはエラー', () => {
    expect(validateScheduleEntryInput({ ...base, date: '2027-02-30' }).ok).toBe(false);
    expect(validateScheduleEntryInput({ ...base, date: '2027/01/01' }).ok).toBe(false);
    expect(isValidScheduleDate('2027-01-01')).toBe(true);
    expect(isValidScheduleDate('2027-13-01')).toBe(false);
  });

  it('時刻の形式を検証する', () => {
    expect(validateScheduleEntryInput({ ...base, startTime: '24:00' }).ok).toBe(false);
    expect(isValidScheduleTime('23:59')).toBe(true);
    expect(isValidScheduleTime('9:00')).toBe(false);
  });

  it('終了時刻は開始より後でなければならない', () => {
    expect(
      validateScheduleEntryInput({ ...base, startTime: '10:00', endTime: '10:00' }).ok,
    ).toBe(false);
    expect(
      validateScheduleEntryInput({ ...base, startTime: '10:00', endTime: '09:00' }).ok,
    ).toBe(false);
    expect(
      validateScheduleEntryInput({ ...base, startTime: '10:00', endTime: '11:30' }).ok,
    ).toBe(true);
  });

  it('文字数上限を検証する', () => {
    expect(validateScheduleEntryInput({ ...base, title: 'あ'.repeat(101) }).ok).toBe(false);
    expect(validateScheduleEntryInput({ ...base, place: 'あ'.repeat(101) }).ok).toBe(false);
    expect(validateScheduleEntryInput({ ...base, note: 'あ'.repeat(501) }).ok).toBe(false);
    expect(validateScheduleEntryInput({ ...base, note: 'あ'.repeat(500) }).ok).toBe(true);
  });
});

describe('sortScheduleEntries / groupScheduleByDate', () => {
  const entries = [
    entry({ id: 'a', date: '2027-01-02', startTime: '09:00', title: '二日の行事' }),
    entry({ id: 'b', date: '2027-01-01', startTime: '15:00', title: '午後の行事' }),
    entry({ id: 'c', date: '2027-01-01', startTime: '00:00', title: '元旦祭' }),
    entry({ id: 'd', date: '2027-01-01', startTime: '15:00', title: 'あいうえお' }),
  ];

  it('日付→開始時刻→行事名の順に並ぶ', () => {
    expect(sortScheduleEntries(entries).map((e) => e.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('元の配列を変更しない', () => {
    const before = entries.map((e) => e.id);
    sortScheduleEntries(entries);
    expect(entries.map((e) => e.id)).toEqual(before);
  });

  it('日付ごとにグループ化され、各日の中も日時順', () => {
    const groups = groupScheduleByDate(entries);
    expect(groups.map((g) => g.date)).toEqual(['2027-01-01', '2027-01-02']);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['c', 'd', 'b']);
    expect(groups[1].entries.map((e) => e.id)).toEqual(['a']);
  });

  it('空入力では空配列', () => {
    expect(groupScheduleByDate([])).toEqual([]);
  });
});

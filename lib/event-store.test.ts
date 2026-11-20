// lib/event-store.test.ts
// 主催者一覧（listEventsByOwnerWithSubscriberCounts）が終了済みイベントを
// 除外すること、一覧ではない listEventsByOwner は従来どおり全件を返す
// （同時作成枠の判定用）こと、終了日のシーズン上限（1月31日まで）が
// 作成・更新の両方で効くことを検証する。Firestore はフェイクで置き換える。
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; data: Record<string, unknown> }>,
}));

vi.mock('./firebase-admin', () => ({
  db: {
    collection: () => ({
      where: () => ({
        get: async () => ({
          docs: state.docs.map((doc) => ({
            id: doc.id,
            data: () => doc.data,
          })),
        }),
      }),
      doc: (id?: string) => {
        const docId = id ?? 'ev-created';
        return {
          id: docId,
          set: async (data: Record<string, unknown>) => {
            state.docs.push({ id: docId, data });
          },
          get: async () => {
            const found = state.docs.find((doc) => doc.id === docId);
            return {
              exists: Boolean(found),
              id: docId,
              data: () => found?.data,
            };
          },
          update: async (patch: Record<string, unknown>) => {
            const found = state.docs.find((doc) => doc.id === docId);
            if (found) Object.assign(found.data, patch);
          },
          collection: () => ({
            count: () => ({
              get: async () => ({ data: () => ({ count: 3 }) }),
            }),
          }),
        };
      },
    }),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => null },
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({}) }),
}));

import {
  createEvent,
  listEventsByOwner,
  listEventsByOwnerWithSubscriberCounts,
  updateEvent,
} from './event-store';

function eventData(status: string): Record<string, unknown> {
  return {
    name: 'テストイベント',
    ownerUid: 'owner-1',
    startDate: '2026-12-31',
    endDate: '2027-01-03',
    resetMode: 'full-daily',
    resetTime: '00:00',
    subscriberCap: 50000,
    defaultLocale: 'ja',
    status,
  };
}

beforeEach(() => {
  state.docs = [
    { id: 'ev-draft', data: eventData('draft') },
    { id: 'ev-live', data: eventData('live') },
    { id: 'ev-ended', data: eventData('ended') },
  ];
});

describe('listEventsByOwnerWithSubscriberCounts（一覧表示用）', () => {
  it('終了済みのイベントは一覧に出さない', async () => {
    const events = await listEventsByOwnerWithSubscriberCounts('owner-1');
    expect(events.map((event) => event.id)).toEqual(['ev-draft', 'ev-live']);
  });

  it('残ったイベントには購読者数が付く', async () => {
    const events = await listEventsByOwnerWithSubscriberCounts('owner-1');
    expect(events.every((event) => event.subscriberCount === 3)).toBe(true);
  });
});

describe('listEventsByOwner（枠判定など一覧以外）', () => {
  it('終了済みを含む全件を返す', async () => {
    const events = await listEventsByOwner('owner-1');
    expect(events.map((event) => event.id)).toEqual([
      'ev-draft',
      'ev-live',
      'ev-ended',
    ]);
  });
});

describe('終了日のシーズン上限（1月31日まで）', () => {
  it('作成: シーズン終了日を超える終了日は弾く', async () => {
    await expect(
      createEvent({
        name: 'テストイベント',
        ownerUid: 'owner-1',
        startDate: '2026-12-20',
        endDate: '2027-02-01',
      }),
    ).rejects.toThrow('終了日は1月31日までを指定してください');
  });

  it('作成: ちょうど1月31日は通る', async () => {
    const event = await createEvent({
      name: 'テストイベント',
      ownerUid: 'owner-1',
      startDate: '2026-12-20',
      endDate: '2027-01-31',
    });
    expect(event.endDate).toBe('2027-01-31');
  });

  it('作成: 11月開始でも翌年1月31日は通る', async () => {
    const event = await createEvent({
      name: 'テストイベント',
      ownerUid: 'owner-1',
      startDate: '2026-11-20',
      endDate: '2027-01-31',
    });
    expect(event.endDate).toBe('2027-01-31');
  });

  it('作成: 11月開始で翌年2月1日は弾く', async () => {
    await expect(
      createEvent({
        name: 'テストイベント',
        ownerUid: 'owner-1',
        startDate: '2026-11-20',
        endDate: '2027-02-01',
      }),
    ).rejects.toThrow('終了日は1月31日までを指定してください');
  });

  it('作成: 終了日「未定」なら上限チェックの対象外（保存値は1月31日になる）', async () => {
    const event = await createEvent({
      name: 'テストイベント',
      ownerUid: 'owner-1',
      startDate: '2026-12-20',
      endDate: '2027-03-01',
      endDateUndecided: true,
    });
    expect(event.endDate).toBe('2027-01-31');
    expect(event.endDateUndecided).toBe(true);
  });

  it('更新: シーズン終了日を超える終了日は弾く', async () => {
    await expect(
      updateEvent('ev-live', {
        startDate: '2026-12-31',
        endDate: '2027-02-01',
      }),
    ).rejects.toThrow('終了日は1月31日までを指定してください');
  });

  it('更新: 開始日がパッチに無くても保存済みの開始日を基準に弾く', async () => {
    await expect(
      updateEvent('ev-live', { endDate: '2027-02-15' }),
    ).rejects.toThrow('終了日は1月31日までを指定してください');
  });

  it('更新: 11月開始でも翌年1月31日は通る', async () => {
    await updateEvent('ev-live', {
      startDate: '2026-11-20',
      endDate: '2027-01-31',
    });
    const events = await listEventsByOwner('owner-1');
    expect(events.find((event) => event.id === 'ev-live')?.endDate).toBe(
      '2027-01-31',
    );
  });

  it('更新: 11月開始で翌年2月1日は弾く', async () => {
    await expect(
      updateEvent('ev-live', {
        startDate: '2026-11-20',
        endDate: '2027-02-01',
      }),
    ).rejects.toThrow('終了日は1月31日までを指定してください');
  });

  it('更新: ちょうど1月31日は通る', async () => {
    await updateEvent('ev-live', {
      startDate: '2026-12-31',
      endDate: '2027-01-31',
    });
    const events = await listEventsByOwner('owner-1');
    expect(events.find((event) => event.id === 'ev-live')?.endDate).toBe(
      '2027-01-31',
    );
  });
});

describe('おみくじ・ガチャ設定', () => {
  it('作成: 既定はおみくじオン・ガチャオフ・等位設定なし', async () => {
    const event = await createEvent({
      name: 'テストイベント',
      ownerUid: 'owner-1',
      startDate: '2026-12-20',
      endDate: '2027-01-31',
    });
    expect(event.omikujiEnabled).toBe(true);
    expect(event.gachaEnabled).toBe(false);
    expect(event.gachaPrizes).toEqual([]);
  });

  it('作成: 旧データ（項目なし）はおみくじオン・ガチャオフとして読む', async () => {
    const events = await listEventsByOwner('owner-1');
    const legacy = events.find((event) => event.id === 'ev-live');
    expect(legacy?.omikujiEnabled).toBe(true);
    expect(legacy?.gachaEnabled).toBe(false);
    expect(legacy?.gachaPrizes).toEqual([]);
  });

  it('作成: ガチャ設定は正規化されて保存される（空行は落ち、昇順になる）', async () => {
    const event = await createEvent({
      name: 'テストイベント',
      ownerUid: 'owner-1',
      startDate: '2026-12-20',
      endDate: '2027-01-31',
      gachaEnabled: true,
      gachaPrizes: [
        { rank: 2, name: 'お菓子', probability: 30, stock: null },
        { rank: 3, name: '', probability: 0, stock: null },
        { rank: 1, name: 'お守り', probability: 10, stock: 5 },
      ],
    });
    expect(event.gachaEnabled).toBe(true);
    expect(event.gachaPrizes).toEqual([
      { rank: 1, name: 'お守り', probability: 10, stock: 5 },
      { rank: 2, name: 'お菓子', probability: 30, stock: null },
    ]);
  });

  it('作成: 確率の合計が100を超えるガチャ設定は弾く', async () => {
    await expect(
      createEvent({
        name: 'テストイベント',
        ownerUid: 'owner-1',
        startDate: '2026-12-20',
        endDate: '2027-01-31',
        gachaEnabled: true,
        gachaPrizes: [
          { rank: 1, name: 'A', probability: 60, stock: null },
          { rank: 2, name: 'B', probability: 50, stock: null },
        ],
      }),
    ).rejects.toThrow('ガチャの当選確率の合計は100%以内にしてください');
  });

  it('更新: おみくじ・ガチャのオンオフと等位設定を保存できる', async () => {
    await updateEvent('ev-live', {
      omikujiEnabled: false,
      gachaEnabled: true,
      gachaPrizes: [{ rank: 1, name: 'お守り', probability: 20, stock: null }],
    });
    const events = await listEventsByOwner('owner-1');
    const updated = events.find((event) => event.id === 'ev-live');
    expect(updated?.omikujiEnabled).toBe(false);
    expect(updated?.gachaEnabled).toBe(true);
    expect(updated?.gachaPrizes).toEqual([
      { rank: 1, name: 'お守り', probability: 20, stock: null },
    ]);
  });

  it('更新: フラグの形式が不正なら弾く', async () => {
    await expect(
      updateEvent('ev-live', { omikujiEnabled: 'yes' as never }),
    ).rejects.toThrow('おみくじ設定の形式が不正です');
    await expect(
      updateEvent('ev-live', { gachaEnabled: 1 as never }),
    ).rejects.toThrow('ガチャ設定の形式が不正です');
  });

  it('更新: 等位の範囲外を含むガチャ設定は弾く', async () => {
    await expect(
      updateEvent('ev-live', {
        gachaPrizes: [{ rank: 11, name: 'A', probability: 10, stock: null }],
      }),
    ).rejects.toThrow('ガチャの等位は1〜10で指定してください');
  });
});

// lib/event-gacha.test.ts
// ガチャの抽選（確率・在庫・1人1回）と景品消込をフェイク Firestore で検証する。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GachaPrize } from './event';

const mocks = vi.hoisted(() => ({
  getEvent: vi.fn(),
  store: new Map<string, Record<string, unknown>>(),
}));

vi.mock('./firebase-admin', () => {
  const store = mocks.store;
  function docRef(path: string): Record<string, unknown> {
    return {
      _path: path,
      id: path.split('/').pop() ?? path,
      get: async () => ({
        exists: store.has(path),
        id: path.split('/').pop() ?? path,
        data: () => store.get(path),
      }),
      collection: (name: string) => collectionRef(`${path}/${name}`),
    };
  }
  function collectionRef(path: string): Record<string, unknown> {
    return {
      doc: (id: string) => docRef(`${path}/${id}`),
    };
  }
  return {
    db: {
      collection: (name: string) => collectionRef(name),
      runTransaction: async (
        fn: (tx: {
          get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
          set: (
            ref: { _path: string },
            data: Record<string, unknown>,
            options?: { merge?: boolean },
          ) => void;
          update: (
            ref: { _path: string },
            data: Record<string, unknown>,
          ) => void;
        }) => Promise<unknown>,
      ) =>
        fn({
          get: (ref) => ref.get(),
          set: (ref, data, options) => {
            if (options?.merge && store.has(ref._path)) {
              store.set(ref._path, { ...store.get(ref._path), ...data });
            } else {
              store.set(ref._path, { ...data });
            }
          },
          update: (ref, data) => {
            store.set(ref._path, { ...(store.get(ref._path) ?? {}), ...data });
          },
        }),
    },
  };
});

vi.mock('./event-store', () => ({
  getEvent: mocks.getEvent,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({
      toDate: () => new Date('2027-01-01T00:00:00.000Z'),
    }),
  },
}));

import {
  drawGacha,
  exhaustedGachaRanks,
  gachaRedemptionCode,
  getGachaDraw,
  isGachaRedemptionCode,
  pickGachaPrize,
  redeemGachaCode,
} from './event-gacha';

const EVENT_ID = 'ev-gacha';

function prize(
  rank: number,
  name: string,
  probability: number,
  stock: number | null = null,
): GachaPrize {
  return { rank, name, probability, stock };
}

function seedEvent(gachaEnabled: boolean, gachaPrizes: GachaPrize[]) {
  mocks.getEvent.mockResolvedValue({
    id: EVENT_ID,
    gachaEnabled,
    gachaPrizes,
    defaultLocale: 'ja',
  });
}

function seedMember(memberId: string) {
  mocks.store.set(`events/${EVENT_ID}/members/${memberId}`, {});
}

beforeEach(() => {
  mocks.store.clear();
  mocks.getEvent.mockReset();
});

describe('pickGachaPrize（確率の抽選）', () => {
  const prizes = [prize(1, 'お守り', 10), prize(2, 'お菓子', 20)];

  it('確率帯の境界どおりに当たる', () => {
    expect(pickGachaPrize(prizes, new Set(), () => 0)?.rank).toBe(1);
    expect(pickGachaPrize(prizes, new Set(), () => 0.0999)?.rank).toBe(1);
    expect(pickGachaPrize(prizes, new Set(), () => 0.1)?.rank).toBe(2);
    expect(pickGachaPrize(prizes, new Set(), () => 0.2999)?.rank).toBe(2);
  });

  it('合計確率を超えたらハズレ（残りはハズレ）', () => {
    expect(pickGachaPrize(prizes, new Set(), () => 0.3)).toBeNull();
    expect(pickGachaPrize(prizes, new Set(), () => 0.999)).toBeNull();
  });

  it('在庫切れの等位の帯に当たったらハズレ（再配分しない）', () => {
    const exhausted = new Set([1]);
    expect(pickGachaPrize(prizes, exhausted, () => 0)).toBeNull();
    // 2等の帯はそのまま当たる
    expect(pickGachaPrize(prizes, exhausted, () => 0.15)?.rank).toBe(2);
  });

  it('確率0の等位は対象外で、確率帯も消費しない', () => {
    const withZero = [prize(1, 'お守り', 0), prize(2, 'お菓子', 20)];
    expect(pickGachaPrize(withZero, new Set(), () => 0)?.rank).toBe(2);
    expect(pickGachaPrize(withZero, new Set(), () => 0.2)).toBeNull();
  });
});

describe('exhaustedGachaRanks（在庫切れ判定）', () => {
  it('上限到達で在庫切れ、無制限は常に対象', () => {
    const prizes = [prize(1, 'A', 10, 2), prize(2, 'B', 10, null), prize(3, 'C', 10, 0)];
    const counts = new Map([
      [1, 2],
      [2, 999],
    ]);
    expect(exhaustedGachaRanks(prizes, counts)).toEqual(new Set([1, 3]));
  });

  it('上限未満なら在庫切れでない', () => {
    const prizes = [prize(1, 'A', 10, 2)];
    expect(exhaustedGachaRanks(prizes, new Map([[1, 1]]))).toEqual(new Set());
  });
});

describe('drawGacha（抽選の実行）', () => {
  it('ガチャがオフなら 403', async () => {
    seedEvent(false, [prize(1, 'お守り', 100)]);
    seedMember('mem-1');
    const result = await drawGacha(EVENT_ID, 'mem-1');
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'このイベントではガチャを実施していません',
    });
  });

  it('イベントが無ければ 404、未登録の端末は 403', async () => {
    mocks.getEvent.mockResolvedValue(null);
    await expect(drawGacha(EVENT_ID, 'mem-1')).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
    seedEvent(true, [prize(1, 'お守り', 100)]);
    await expect(drawGacha(EVENT_ID, 'mem-x')).resolves.toMatchObject({
      ok: false,
      status: 403,
      error: '先にイベントへ登録してください',
    });
  });

  it('当選すると交換コードが発行され、当選数が数えられる', async () => {
    seedEvent(true, [prize(1, 'お守り', 100)]);
    seedMember('mem-1');
    const result = await drawGacha(EVENT_ID, 'mem-1', () => 0);
    expect(result).toMatchObject({
      ok: true,
      rank: 1,
      prizeName: 'お守り',
      code: gachaRedemptionCode(EVENT_ID, 'mem-1'),
      alreadyDrawn: false,
      redeemed: false,
    });
    expect(mocks.store.get('gachaPrizeCounts/ev-gacha')).toEqual({
      eventId: EVENT_ID,
      counts: { '1': 1 },
    });
  });

  it('2回目は引かずに同じ結果を返し、当選数も増えない（1人1回）', async () => {
    seedEvent(true, [prize(1, 'お守り', 100)]);
    seedMember('mem-1');
    await drawGacha(EVENT_ID, 'mem-1', () => 0);
    const second = await drawGacha(EVENT_ID, 'mem-1', () => 0);
    expect(second).toMatchObject({ ok: true, rank: 1, alreadyDrawn: true });
    expect(mocks.store.get('gachaPrizeCounts/ev-gacha')).toEqual({
      eventId: EVENT_ID,
      counts: { '1': 1 },
    });
  });

  it('ハズレも記録され、引き直しはできない', async () => {
    seedEvent(true, [prize(1, 'お守り', 10)]);
    seedMember('mem-1');
    const first = await drawGacha(EVENT_ID, 'mem-1', () => 0.5);
    expect(first).toMatchObject({ ok: true, rank: null, code: null });
    const second = await drawGacha(EVENT_ID, 'mem-1', () => 0);
    expect(second).toMatchObject({ ok: true, rank: null, alreadyDrawn: true });
    expect(mocks.store.has('gachaPrizeCounts/ev-gacha')).toBe(false);
  });

  it('当選上限に達した等位は、帯に当たってもハズレになる', async () => {
    seedEvent(true, [prize(1, '限定お守り', 50, 1), prize(2, 'お菓子', 50)]);
    seedMember('mem-1');
    seedMember('mem-2');
    seedMember('mem-3');
    const first = await drawGacha(EVENT_ID, 'mem-1', () => 0);
    expect(first).toMatchObject({ ok: true, rank: 1 });
    // 1等の上限（1本）に到達。同じ帯（roll 0）でもハズレ
    const second = await drawGacha(EVENT_ID, 'mem-2', () => 0);
    expect(second).toMatchObject({ ok: true, rank: null, code: null });
    // 2等の帯は通常どおり当たる
    const third = await drawGacha(EVENT_ID, 'mem-3', () => 0.6);
    expect(third).toMatchObject({ ok: true, rank: 2 });
    expect(mocks.store.get('gachaPrizeCounts/ev-gacha')).toEqual({
      eventId: EVENT_ID,
      counts: { '1': 1, '2': 1 },
    });
  });
});

describe('redeemGachaCode（景品の消込）', () => {
  async function seedWin(memberId: string) {
    seedEvent(true, [prize(1, 'お守り', 100)]);
    seedMember(memberId);
    const result = await drawGacha(EVENT_ID, memberId, () => 0);
    if (!result.ok || !result.code) throw new Error('seed failed');
    return result.code;
  }

  it('主催者は消込でき、記録に交換済みが残る', async () => {
    const code = await seedWin('mem-1');
    const result = await redeemGachaCode(EVENT_ID, code, { type: 'organizer' });
    expect(result).toEqual({ ok: true, claimId: code });
    const record = await getGachaDraw(EVENT_ID, 'mem-1');
    expect(record?.redeemed).toBe(true);
  });

  it('出店者でも消込できる（主催者発行の景品のため）', async () => {
    const code = await seedWin('mem-1');
    const result = await redeemGachaCode(EVENT_ID, code, {
      type: 'exhibitor',
      exhibitorId: 'ex-1',
    });
    expect(result.ok).toBe(true);
  });

  it('二重の消込は 409 で弾く', async () => {
    const code = await seedWin('mem-1');
    await redeemGachaCode(EVENT_ID, code, { type: 'organizer' });
    const second = await redeemGachaCode(EVENT_ID, code, { type: 'organizer' });
    expect(second).toEqual({
      ok: false,
      status: 409,
      error: 'このクーポンは消込済みです',
    });
  });

  it('存在しないコード・他イベントのコードは 404', async () => {
    await seedWin('mem-1');
    await expect(
      redeemGachaCode(EVENT_ID, gachaRedemptionCode(EVENT_ID, 'mem-zzz'), {
        type: 'organizer',
      }),
    ).resolves.toMatchObject({ ok: false, status: 404 });
    await expect(
      redeemGachaCode('ev-other', gachaRedemptionCode(EVENT_ID, 'mem-1'), {
        type: 'organizer',
      }),
    ).resolves.toMatchObject({ ok: false, status: 404 });
  });

  it('ハズレの記録には交換コードが無く、消込できない', async () => {
    seedEvent(true, [prize(1, 'お守り', 10)]);
    seedMember('mem-1');
    await drawGacha(EVENT_ID, 'mem-1', () => 0.5);
    const forged = gachaRedemptionCode(EVENT_ID, 'mem-1');
    await expect(
      redeemGachaCode(EVENT_ID, forged, { type: 'organizer' }),
    ).resolves.toMatchObject({ ok: false, status: 404 });
  });

  it('コードの接頭辞で判別できる', () => {
    expect(isGachaRedemptionCode(gachaRedemptionCode('ev', 'mem'))).toBe(true);
    expect(isGachaRedemptionCode('mem_coupon')).toBe(false);
  });
});

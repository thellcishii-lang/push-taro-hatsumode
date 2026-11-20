// lib/event-reset-execution.test.ts
// 日次リセットと終了処理の実行テスト（フェイク Firestore）。
// 初詣の要点:
// - おみくじ抽選記録（omikujiDraws）と行事予定（schedule）、
//   ガチャ抽選記録（gachaDraws）と当選数カウンタ（gachaPrizeCounts）は
//   日次リセットで消えない。
// - 終了処理（1月31日 24:00 の最終消去）ではすべて消える。
//   他イベントの抽選記録には触れない。
import { beforeEach, describe, expect, it, vi } from 'vitest';

type DocData = Record<string, unknown>;

const fake = vi.hoisted(() => {
  const store = new Map<string, Map<string, DocData>>();

  const colMap = (path: string) => {
    let c = store.get(path);
    if (!c) {
      c = new Map();
      store.set(path, c);
    }
    return c;
  };
  const splitDoc = (path: string) => {
    const idx = path.lastIndexOf('/');
    return { colPath: path.slice(0, idx), id: path.slice(idx + 1) };
  };

  function makeDocRef(path: string): unknown {
    const { colPath, id } = splitDoc(path);
    return {
      id,
      path,
      async get() {
        const data = colMap(colPath).get(id);
        return {
          exists: data !== undefined,
          id,
          ref: makeDocRef(path),
          data: () => data,
        };
      },
      async set(data: DocData) {
        colMap(colPath).set(id, { ...data });
      },
      async update(data: DocData) {
        const current = colMap(colPath).get(id) ?? {};
        colMap(colPath).set(id, { ...current, ...data });
      },
      async delete() {
        colMap(colPath).delete(id);
      },
      collection(name: string) {
        return makeCollectionRef(`${path}/${name}`);
      },
    };
  }

  function snapshotOf(colPath: string, entries: Array<[string, DocData]>) {
    return {
      empty: entries.length === 0,
      size: entries.length,
      docs: entries.map(([id, data]) => ({
        id,
        ref: makeDocRef(`${colPath}/${id}`),
        data: () => data,
      })),
    };
  }

  function makeQuery(colPath: string, filter?: { field: string; value: unknown }) {
    const matching = () =>
      [...colMap(colPath).entries()].filter(
        ([, data]) => !filter || data[filter.field] === filter.value,
      );
    return {
      where(field: string, _op: string, value: unknown) {
        return makeQuery(colPath, { field, value });
      },
      limit(n: number) {
        return {
          get: async () => snapshotOf(colPath, matching().slice(0, n)),
        };
      },
      get: async () => snapshotOf(colPath, matching()),
    };
  }

  function makeCollectionRef(path: string): unknown {
    return {
      ...makeQuery(path),
      doc(id: string) {
        return makeDocRef(`${path}/${id}`);
      },
      async add(data: DocData) {
        const id = `doc-${colMap(path).size + 1}-${Math.random()}`;
        colMap(path).set(id, { ...data });
        return makeDocRef(`${path}/${id}`);
      },
    };
  }

  const db = {
    collection: (path: string) => makeCollectionRef(path),
    doc: (path: string) => makeDocRef(path),
    batch() {
      const ops: Array<() => Promise<void>> = [];
      return {
        delete: (ref: { delete: () => Promise<void> }) =>
          ops.push(() => ref.delete()),
        update: (ref: { update: (d: DocData) => Promise<void> }, data: DocData) =>
          ops.push(() => ref.update(data)),
        set: (ref: { set: (d: DocData) => Promise<void> }, data: DocData) =>
          ops.push(() => ref.set(data)),
        commit: async () => {
          for (const op of ops) await op();
        },
      };
    },
  };

  return {
    db,
    clear: () => store.clear(),
    seed: (colPath: string, id: string, data: DocData) => {
      colMap(colPath).set(id, { ...data });
    },
    count: (colPath: string) => colMap(colPath).size,
    getDoc: (docPath: string) => {
      const { colPath, id } = splitDoc(docPath);
      return colMap(colPath).get(id);
    },
  };
});

vi.mock('./firebase-admin', () => ({
  db: fake.db,
  messaging: { unsubscribeFromTopic: vi.fn(async () => {}) },
  auth: { verifyIdToken: vi.fn(async () => { throw new Error('unused'); }) },
}));
vi.mock('./event-report', () => ({
  snapshotDailyStats: vi.fn(async () => {}),
  buildAndPersistFinalReport: vi.fn(async () => ({})),
  ensureReportBackup: vi.fn(async () => {}),
}));
vi.mock('./event-report-send', () => ({
  trySendFinalReportEmail: vi.fn(async () => {}),
}));
vi.mock('./event-store', () => ({
  updateEvent: vi.fn(async (id: string, data: DocData) => {
    const current = fake.getDoc(`events/${id}`) ?? {};
    fake.seed('events', id, { ...current, ...data });
  }),
}));
vi.mock('./organizers', () => ({
  findOrganizerByOwnerUid: vi.fn(async () => null),
}));
vi.mock('./event-billing', () => ({
  cancelEventSubscriptionsForFinalization: vi.fn(async () => ({
    canceledCount: 0,
    failedCount: 0,
    errors: [],
  })),
}));

import {
  executeEventFinalization,
  executeEventReset,
} from './event-reset';
import type { EventConfig } from './event';

const EVENT_ID = 'ev-hatsu';
const event = {
  id: EVENT_ID,
  resetMode: 'full-daily',
  ownerUid: 'owner-1',
  backupRetentionDays: 30,
} as unknown as EventConfig;

const NOW = new Date('2027-01-10T00:30:00+09:00');

function seedAll() {
  fake.clear();
  fake.seed('events', EVENT_ID, { id: EVENT_ID });
  fake.seed(`events/${EVENT_ID}/subscribers`, 'sub-1', { lang: 'ja' });
  fake.seed(`events/${EVENT_ID}/subscribers`, 'sub-2', { lang: 'en' });
  fake.seed(`events/${EVENT_ID}/members`, 'mem-1', { displayName: 'A' });
  fake.seed(`events/${EVENT_ID}/schedule`, 'sch-1', { title: '元旦祭' });
  fake.seed(`events/${EVENT_ID}/schedule`, 'sch-2', { title: '節分祭' });
  fake.seed('omikujiDraws', `${EVENT_ID}_mem-1`, {
    eventId: EVENT_ID,
    memberId: 'mem-1',
    grade: 'daikichi',
  });
  fake.seed('omikujiDraws', `${EVENT_ID}_mem-2`, {
    eventId: EVENT_ID,
    memberId: 'mem-2',
    grade: 'kyo',
  });
  fake.seed('omikujiDraws', 'ev-other_mem-1', {
    eventId: 'ev-other',
    memberId: 'mem-1',
    grade: 'kichi',
  });
  fake.seed('gachaDraws', `${EVENT_ID}_mem-1`, {
    eventId: EVENT_ID,
    memberId: 'mem-1',
    rank: 1,
  });
  fake.seed('gachaDraws', `${EVENT_ID}_mem-2`, {
    eventId: EVENT_ID,
    memberId: 'mem-2',
    rank: null,
  });
  fake.seed('gachaDraws', 'ev-other_mem-1', {
    eventId: 'ev-other',
    memberId: 'mem-1',
    rank: 2,
  });
  fake.seed('gachaPrizeCounts', EVENT_ID, {
    eventId: EVENT_ID,
    counts: { '1': 1 },
  });
  fake.seed('gachaPrizeCounts', 'ev-other', {
    eventId: 'ev-other',
    counts: { '2': 1 },
  });
}

describe('日次リセットとおみくじ・行事予定', () => {
  beforeEach(() => {
    seedAll();
  });

  it('日次リセットでは購読者・端末情報は消えるが、抽選記録と行事予定は残る', async () => {
    const result = await executeEventReset(event, NOW);
    expect(result.completed).toBe(true);
    expect(fake.count(`events/${EVENT_ID}/subscribers`)).toBe(0);
    expect(fake.count(`events/${EVENT_ID}/members`)).toBe(0);
    // おみくじ抽選記録は日次リセットの対象外（期間中1回を守る台帳）
    expect(fake.count('omikujiDraws')).toBe(3);
    // ガチャ抽選記録と当選数カウンタも日次リセットの対象外
    expect(fake.count('gachaDraws')).toBe(3);
    expect(fake.getDoc(`gachaPrizeCounts/${EVENT_ID}`)).toBeDefined();
    // 行事予定も対象外（複数日にまたがる）
    expect(fake.count(`events/${EVENT_ID}/schedule`)).toBe(2);
    // 完了記録が付く
    expect(fake.getDoc(`events/${EVENT_ID}`)?.lastResetDate).toBe('2027-01-10');
  });

  it('終了処理では抽選記録と行事予定も消える（他イベント分は残る）', async () => {
    const result = await executeEventFinalization(event, NOW);
    expect(result.completed).toBe(true);
    expect(result.deletedScheduleCount).toBe(2);
    expect(result.deletedOmikujiDrawCount).toBe(2);
    expect(fake.count(`events/${EVENT_ID}/schedule`)).toBe(0);
    expect(fake.count(`events/${EVENT_ID}/subscribers`)).toBe(0);
    // 他イベントの抽選記録には触れない
    expect(fake.count('omikujiDraws')).toBe(1);
    expect(fake.getDoc('omikujiDraws/ev-other_mem-1')).toBeDefined();
    // ガチャ抽選記録と当選数カウンタも消える（他イベント分は残る）
    expect(result.deletedGachaDrawCount).toBe(2);
    expect(fake.count('gachaDraws')).toBe(1);
    expect(fake.getDoc('gachaDraws/ev-other_mem-1')).toBeDefined();
    expect(fake.getDoc(`gachaPrizeCounts/${EVENT_ID}`)).toBeUndefined();
    expect(fake.getDoc('gachaPrizeCounts/ev-other')).toBeDefined();
    expect(fake.getDoc(`events/${EVENT_ID}`)?.status).toBe('ended');
  });

  it('終了処理は予算が尽きたら未完了になり、次回に続きから消える', async () => {
    // 購読者2 + 端末1 + 予定2 + 抽選2 = 7件。予算3では終わらない
    const first = await executeEventFinalization(event, NOW, 3);
    expect(first.completed).toBe(false);
    expect(fake.getDoc(`events/${EVENT_ID}`)?.status).toBeUndefined();
    const second = await executeEventFinalization(event, NOW, 100);
    expect(second.completed).toBe(true);
    expect(fake.count('omikujiDraws')).toBe(1);
    expect(fake.count(`events/${EVENT_ID}/schedule`)).toBe(0);
    expect(fake.getDoc(`events/${EVENT_ID}`)?.status).toBe('ended');
  });
});

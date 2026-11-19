// lib/event-omikuji.test.ts
// 抽選の冪等性（1端末1回・再抽選は同じ結果を返す）をフェイク Firestore で検証する。
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
          set: (ref: { _path: string }, data: Record<string, unknown>) => void;
        }) => Promise<unknown>,
      ) =>
        fn({
          get: (ref) => ref.get(),
          set: (ref, data) => {
            store.set(ref._path, { ...data });
          },
        }),
    },
  };
});

vi.mock('./event-store', () => ({
  getEvent: mocks.getEvent,
}));

const { drawOmikuji, getOmikujiDraw, omikujiDrawDocId, OMIKUJI_DRAWS_COLLECTION } =
  await import('./event-omikuji');
const { isOmikujiGrade } = await import('./omikuji-content');

const EVENT_ID = 'event-1';
const MEMBER_ID = 'member-abc';

function seedMember() {
  mocks.store.set(`events/${EVENT_ID}/members/${MEMBER_ID}`, { deviceUid: 'uid-1' });
}

beforeEach(() => {
  mocks.store.clear();
  mocks.getEvent.mockReset();
  mocks.getEvent.mockResolvedValue({ id: EVENT_ID });
});

describe('omikujiDrawDocId', () => {
  it('eventId と memberId から決定論的に決まる', () => {
    expect(omikujiDrawDocId('e1', 'm1')).toBe('e1_m1');
    expect(OMIKUJI_DRAWS_COLLECTION).toBe('omikujiDraws');
  });
});

describe('drawOmikuji', () => {
  it('初回は抽選して記録し、alreadyDrawn=false を返す', async () => {
    seedMember();
    const result = await drawOmikuji(EVENT_ID, MEMBER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyDrawn).toBe(false);
    expect(isOmikujiGrade(result.grade)).toBe(true);
    expect(
      mocks.store.has(`${OMIKUJI_DRAWS_COLLECTION}/${EVENT_ID}_${MEMBER_ID}`),
    ).toBe(true);
  });

  it('2回目は再抽選せず、同じ運勢を alreadyDrawn=true で返す', async () => {
    seedMember();
    const first = await drawOmikuji(EVENT_ID, MEMBER_ID);
    const second = await drawOmikuji(EVENT_ID, MEMBER_ID);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.alreadyDrawn).toBe(true);
    expect(second.grade).toBe(first.grade);
  });

  it('未登録の端末は 403', async () => {
    const result = await drawOmikuji(EVENT_ID, MEMBER_ID);
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: '先にイベントへ登録してください',
    });
  });

  it('イベントが無ければ 404', async () => {
    mocks.getEvent.mockResolvedValue(null);
    const result = await drawOmikuji(EVENT_ID, MEMBER_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });
});

describe('getOmikujiDraw', () => {
  it('未抽選なら null、抽選後は記録を返す', async () => {
    seedMember();
    expect(await getOmikujiDraw(EVENT_ID, MEMBER_ID)).toBeNull();
    const drawn = await drawOmikuji(EVENT_ID, MEMBER_ID);
    const record = await getOmikujiDraw(EVENT_ID, MEMBER_ID);
    expect(record).not.toBeNull();
    expect(record?.eventId).toBe(EVENT_ID);
    expect(record?.memberId).toBe(MEMBER_ID);
    if (drawn.ok) expect(record?.grade).toBe(drawn.grade);
  });
});

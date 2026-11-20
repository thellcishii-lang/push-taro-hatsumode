// app/api/events/[eventId]/registration-status/route.test.ts
// 登録状態 API の検証: 認証（端末認証のトークン）、登録済み/未登録の判定、
// 存在しないイベント。判定は購読者レコードの有無で行う（日次リセットが
// コレクションを丸ごと消すため、残っているレコード = いまの登録分）。
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  subscribers: new Map<string, Record<string, unknown>>(),
  verifyIdToken: vi.fn(),
  getEvent: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  db: {
    collection: (_name: string) => ({
      doc: (_eventId: string) => ({
        collection: (_sub: string) => ({
          doc: (id: string) => ({
            get: async () => {
              const data = mocks.subscribers.get(id);
              return { exists: Boolean(data), id, data: () => data };
            },
          }),
        }),
      }),
    }),
  },
  messaging: {
    subscribeToTopic: vi.fn(async () => ({})),
    unsubscribeFromTopic: vi.fn(async () => ({})),
  },
  authAdmin: { verifyIdToken: mocks.verifyIdToken },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => null },
}));

vi.mock('@/lib/event-store', () => ({
  getEvent: mocks.getEvent,
}));

const { GET } = await import('./route');
const { memberIdForDevice } = await import('@/lib/event-coupon');

const EVENT_ID = 'event-1';
const MEMBER_ID = memberIdForDevice('device-1');

function request(token?: string) {
  return new Request(
    `http://localhost/api/events/${EVENT_ID}/registration-status`,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  );
}

function params(eventId: string = EVENT_ID) {
  return { params: Promise.resolve({ eventId }) };
}

beforeEach(() => {
  mocks.subscribers.clear();
  mocks.verifyIdToken.mockReset();
  mocks.verifyIdToken.mockResolvedValue({ uid: 'device-1' });
  mocks.getEvent.mockReset();
  mocks.getEvent.mockResolvedValue({ id: EVENT_ID });
});

describe('GET /api/events/[eventId]/registration-status', () => {
  it('認証ヘッダーが無ければ 401', async () => {
    const res = await GET(request(), params());
    expect(res.status).toBe(401);
  });

  it('トークンの検証に失敗したら 401', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('expired'));
    const res = await GET(request('bad-token'), params());
    expect(res.status).toBe(401);
  });

  it('購読者レコードがあれば registered: true', async () => {
    mocks.subscribers.set(MEMBER_ID, {
      memberId: MEMBER_ID,
      fcmToken: 'token-1',
      lang: 'ja',
      registeredDate: '2027-01-01',
    });
    const res = await GET(request('token'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ registered: true });
  });

  it('購読者レコードが無ければ registered: false（リセット後はこの状態）', async () => {
    const res = await GET(request('token'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ registered: false });
  });

  it('年越しの前倒しリセットをまたいだ登録（registeredDate は前日）も登録済みとして扱う', async () => {
    // 12月31日 21:00 の前倒しリセット以降の登録は、registeredDate が
    // 12月31日のまま元日の購読者として保持される。日付比較で判定すると
    // 元日に「未登録」と誤判定するため、有無で判定することを担保する。
    mocks.subscribers.set(MEMBER_ID, {
      memberId: MEMBER_ID,
      fcmToken: 'token-1',
      lang: 'ja',
      registeredDate: '2026-12-31',
    });
    const res = await GET(request('token'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ registered: true });
  });

  it('存在しないイベントは 404', async () => {
    mocks.getEvent.mockResolvedValue(null);
    const res = await GET(request('token'), params('unknown-event'));
    expect(res.status).toBe(404);
  });
});

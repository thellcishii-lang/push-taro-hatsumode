// lib/event-register.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Firestore と FCM はフェイクで置き換え、トピック所属の揃え直し
// （プッシュ二重配信の修正）を検証する。
const mocks = vi.hoisted(() => ({
  subscribers: new Map<string, Record<string, unknown>>(),
  members: new Map<string, Record<string, unknown>>(),
  subscribeToTopic: vi.fn(async (_tokens: string[], _topic: string) => ({})),
  unsubscribeFromTopic: vi.fn(async (_tokens: string[], _topic: string) => ({})),
  event: {
    status: 'live',
    startDate: '2026-12-31',
    endDate: '2027-01-31',
    manualEndAt: null as string | null,
    defaultLocale: 'ja',
  },
}));

vi.mock('./firebase-admin', () => {
  type Kind = 'subscribers' | 'members';
  type DocRef = { __kind: Kind; __id: string };
  const storeFor = (kind: Kind) =>
    kind === 'subscribers' ? mocks.subscribers : mocks.members;
  const docRef = (kind: Kind, id: string) => ({
    __kind: kind as Kind,
    __id: id,
    get: async () => {
      const data = storeFor(kind).get(id);
      return { exists: Boolean(data), id, data: () => data };
    },
    update: async (patch: Record<string, unknown>) => {
      const current = storeFor(kind).get(id);
      if (current) Object.assign(current, patch);
    },
  });
  return {
    db: {
      collection: (_name: string) => ({
        doc: (_eventId: string) => ({
          collection: (sub: string) => ({
            doc: (id: string) =>
              docRef(sub === 'subscribers' ? 'subscribers' : 'members', id),
          }),
        }),
      }),
      batch: () => {
        const ops: Array<() => void> = [];
        return {
          set: (ref: DocRef, data: Record<string, unknown>) => {
            ops.push(() => storeFor(ref.__kind).set(ref.__id, { ...data }));
          },
          update: (ref: DocRef, data: Record<string, unknown>) => {
            ops.push(() => {
              const current = storeFor(ref.__kind).get(ref.__id);
              if (current) Object.assign(current, data);
            });
          },
          commit: async () => {
            ops.forEach((op) => op());
          },
        };
      },
    },
    messaging: {
      subscribeToTopic: mocks.subscribeToTopic,
      unsubscribeFromTopic: mocks.unsubscribeFromTopic,
    },
    getAdminAccessToken: async () => 'test-token',
  };
});

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => null },
}));

vi.mock('./event-store', () => ({
  getEvent: async () => mocks.event,
}));

import {
  evaluateRegistration,
  registerEventVisitor,
  updateSubscriberLanguage,
} from './event-register';
import { memberIdForDevice } from './event-coupon';
import { localeTopic } from './event';
import { SUPPORTED_LOCALES } from './i18n';

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

const EVENT_ID = 'ev1';
const NOW = new Date('2027-01-01T12:00:00+09:00');
const MEMBER_ID = memberIdForDevice('device-1');

function seedSubscriber(fcmToken: string, lang: string) {
  mocks.subscribers.set(MEMBER_ID, { memberId: MEMBER_ID, fcmToken, lang });
  mocks.members.set(MEMBER_ID, { authMethod: 'device', deviceUid: 'device-1' });
}

function unsubscribedTopics(token: string): string[] {
  return mocks.unsubscribeFromTopic.mock.calls
    .filter((call) => call[0][0] === token)
    .map((call) => call[1])
    .sort();
}

beforeEach(() => {
  mocks.subscribers.clear();
  mocks.members.clear();
  mocks.subscribeToTopic.mockReset();
  mocks.subscribeToTopic.mockResolvedValue({});
  mocks.unsubscribeFromTopic.mockReset();
  mocks.unsubscribeFromTopic.mockResolvedValue({});
});

describe('registerEventVisitor のトピック所属の揃え直し', () => {
  it('トークンが変わった再登録では、旧トークンを全言語のトピックから外す', async () => {
    seedSubscriber('old-token', 'ja');
    const result = await registerEventVisitor(EVENT_ID, {
      deviceUid: 'device-1',
      fcmToken: 'new-token',
      lang: 'ja',
      now: NOW,
    });
    expect(result).toEqual({ ok: true, memberId: MEMBER_ID });
    // 旧トークンは全言語から解除される
    expect(unsubscribedTopics('old-token')).toEqual(
      SUPPORTED_LOCALES.map((locale) => localeTopic(EVENT_ID, locale)).sort(),
    );
    // 新トークンは自分の言語以外から外れ、自分の言語に登録される
    expect(unsubscribedTopics('new-token')).toEqual(
      SUPPORTED_LOCALES.filter((locale) => locale !== 'ja')
        .map((locale) => localeTopic(EVENT_ID, locale))
        .sort(),
    );
    expect(mocks.subscribeToTopic.mock.calls).toEqual([
      [['new-token'], localeTopic(EVENT_ID, 'ja')],
    ]);
  });

  it('同じトークン・同じ言語の再登録でも、他の言語のトピックから外して修復する', async () => {
    seedSubscriber('token-1', 'ja');
    const result = await registerEventVisitor(EVENT_ID, {
      deviceUid: 'device-1',
      fcmToken: 'token-1',
      lang: 'ja',
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(unsubscribedTopics('token-1')).toEqual(
      SUPPORTED_LOCALES.filter((locale) => locale !== 'ja')
        .map((locale) => localeTopic(EVENT_ID, locale))
        .sort(),
    );
    expect(mocks.subscribeToTopic.mock.calls).toEqual([
      [['token-1'], localeTopic(EVENT_ID, 'ja')],
    ]);
  });

  it('1言語の解除が失敗しても、他の解除と登録は行われ、登録は成功する', async () => {
    seedSubscriber('token-1', 'ja');
    mocks.unsubscribeFromTopic.mockImplementation(
      async (_tokens: string[], topic: string) => {
        if (topic === localeTopic(EVENT_ID, 'en')) {
          throw new Error('一時的なFCMエラー');
        }
        return {};
      },
    );
    const result = await registerEventVisitor(EVENT_ID, {
      deviceUid: 'device-1',
      fcmToken: 'token-1',
      lang: 'ja',
      now: NOW,
    });
    expect(result.ok).toBe(true);
    // 失敗した en 以外（zh・ko）の解除は呼ばれている
    expect(unsubscribedTopics('token-1')).toEqual(
      SUPPORTED_LOCALES.filter((locale) => locale !== 'ja')
        .map((locale) => localeTopic(EVENT_ID, locale))
        .sort(),
    );
    expect(mocks.subscribeToTopic.mock.calls).toEqual([
      [['token-1'], localeTopic(EVENT_ID, 'ja')],
    ]);
  });
});

describe('updateSubscriberLanguage のトピック所属の揃え直し', () => {
  it('言語変更では、変更先以外の全トピック（旧言語を含む）から外す', async () => {
    seedSubscriber('token-1', 'ja');
    const result = await updateSubscriberLanguage(EVENT_ID, MEMBER_ID, 'en');
    expect(result).toEqual({ ok: true });
    expect(unsubscribedTopics('token-1')).toEqual(
      SUPPORTED_LOCALES.filter((locale) => locale !== 'en')
        .map((locale) => localeTopic(EVENT_ID, locale))
        .sort(),
    );
    expect(mocks.subscribeToTopic.mock.calls).toEqual([
      [['token-1'], localeTopic(EVENT_ID, 'en')],
    ]);
    expect(mocks.subscribers.get(MEMBER_ID)?.lang).toBe('en');
  });
});

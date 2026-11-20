// app/api/events/route.test.ts
// POST の作成時状態指定（下書き／開催中）が createEvent へ渡ることと、
// 不正な状態指定・同時上限では作成されないこと、GET が一覧表示用
// （終了済みを除く）の一覧取得を使うことを検証する。
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUidFromRequest: vi.fn(),
  passwordChangeBlock: vi.fn(),
  createEvent: vi.fn(),
  listEventsByOwner: vi.fn(),
  listEventsByOwnerWithSubscriberCounts: vi.fn(),
  findOrganizerByOwnerUid: vi.fn(),
  resolveEffectiveCaps: vi.fn(),
}));

vi.mock('@/lib/event-auth', () => ({
  getUidFromRequest: mocks.getUidFromRequest,
  passwordChangeBlock: mocks.passwordChangeBlock,
}));
vi.mock('@/lib/event-store', () => ({
  createEvent: mocks.createEvent,
  listEventsByOwner: mocks.listEventsByOwner,
  listEventsByOwnerWithSubscriberCounts:
    mocks.listEventsByOwnerWithSubscriberCounts,
}));
vi.mock('@/lib/organizers', () => ({
  findOrganizerByOwnerUid: mocks.findOrganizerByOwnerUid,
  resolveEffectiveCaps: mocks.resolveEffectiveCaps,
}));

import { GET, POST } from './route';

function postRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const baseBody = {
  name: 'テストイベント',
  startDate: '2026-11-20',
  endDate: '2026-11-21',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUidFromRequest.mockResolvedValue('owner-1');
  mocks.passwordChangeBlock.mockResolvedValue(null);
  mocks.listEventsByOwner.mockResolvedValue([]);
  mocks.findOrganizerByOwnerUid.mockResolvedValue(null);
  mocks.resolveEffectiveCaps.mockReturnValue({
    subscriberCap: 50000,
    couponCap: 100,
  });
  mocks.createEvent.mockResolvedValue({ id: 'event-1', status: 'draft' });
  mocks.listEventsByOwnerWithSubscriberCounts.mockResolvedValue([]);
});

describe('GET /api/events', () => {
  it('一覧表示用（終了済みを除く）の一覧を返す', async () => {
    const listed = [
      { id: 'event-1', status: 'live', subscriberCount: 3 },
      { id: 'event-2', status: 'draft', subscriberCount: 0 },
    ];
    mocks.listEventsByOwnerWithSubscriberCounts.mockResolvedValue(listed);
    const response = await GET(
      new Request('http://localhost/api/events', { method: 'GET' }),
    );
    expect(response.status).toBe(200);
    expect(
      mocks.listEventsByOwnerWithSubscriberCounts,
    ).toHaveBeenCalledWith('owner-1');
    const body = (await response.json()) as { events: unknown };
    expect(body.events).toEqual(listed);
  });

  it('未認証なら 401', async () => {
    mocks.getUidFromRequest.mockResolvedValue(null);
    const response = await GET(
      new Request('http://localhost/api/events', { method: 'GET' }),
    );
    expect(response.status).toBe(401);
    expect(
      mocks.listEventsByOwnerWithSubscriberCounts,
    ).not.toHaveBeenCalled();
  });
});

describe('POST /api/events', () => {
  it('状態未指定なら下書きで作成する', async () => {
    const response = await POST(postRequest(baseBody));
    expect(response.status).toBe(201);
    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
    );
  });

  it('状態に live を指定すると開催中として作成する', async () => {
    const response = await POST(postRequest({ ...baseBody, status: 'live' }));
    expect(response.status).toBe(201);
    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'live' }),
    );
  });

  it('状態に draft を指定すると下書きで作成する', async () => {
    const response = await POST(postRequest({ ...baseBody, status: 'draft' }));
    expect(response.status).toBe(201);
    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
    );
  });

  it('状態に ended を指定したら 400 で作成しない', async () => {
    const response = await POST(postRequest({ ...baseBody, status: 'ended' }));
    expect(response.status).toBe(400);
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it('下書き＋開催中が上限（3件）に達していたら 400 で作成しない', async () => {
    mocks.listEventsByOwner.mockResolvedValue([
      { status: 'draft' },
      { status: 'live' },
      { status: 'draft' },
    ]);
    const response = await POST(postRequest({ ...baseBody, status: 'live' }));
    expect(response.status).toBe(400);
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it('未認証なら 401', async () => {
    mocks.getUidFromRequest.mockResolvedValue(null);
    const response = await POST(postRequest(baseBody));
    expect(response.status).toBe(401);
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it('終了日「未定」なら終了日なしでも作成でき、フラグが createEvent へ渡る', async () => {
    const response = await POST(
      postRequest({
        name: 'テストイベント',
        startDate: '2026-12-20',
        endDateUndecided: true,
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ endDateUndecided: true }),
    );
  });

  it('終了日「未定」でなければ終了日の形式不正は 400 で作成しない', async () => {
    const response = await POST(
      postRequest({ name: 'テストイベント', startDate: '2026-12-20' }),
    );
    expect(response.status).toBe(400);
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });
});

// app/api/admin/events/[eventId]/end/route.test.ts
// 手動終了の受付が「主催者本人の確認（requireEventOwner）」を通し、
// 開催中イベントにだけ manualEndAt を記録することを検証する。
// 既に受付済みなら冪等に成功し、終了処理済み・開催中以外は 409 で止まる。
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireEventOwner: vi.fn(),
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock('@/lib/event-auth', () => ({
  requireEventOwner: mocks.requireEventOwner,
}));
vi.mock('@/lib/event-store', () => ({
  getEvent: mocks.getEvent,
  updateEvent: mocks.updateEvent,
}));

import { POST } from './route';

const EVENT_ID = 'event-1';

function postRequest() {
  return new Request(`http://localhost/api/admin/events/${EVENT_ID}/end`, {
    method: 'POST',
  });
}

function guardWith(event: Record<string, unknown>) {
  mocks.requireEventOwner.mockResolvedValue({
    uid: 'owner-1',
    event: { id: EVENT_ID, status: 'live', manualEndAt: null, finalizedAt: null, ...event },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateEvent.mockResolvedValue(undefined);
  mocks.getEvent.mockResolvedValue({
    id: EVENT_ID,
    status: 'live',
    manualEndAt: '2026-12-30T03:00:00.000Z',
    finalizedAt: null,
  });
});

describe('POST /api/admin/events/[eventId]/end', () => {
  it('本人確認で弾かれたらそのエラーを返し、記録しない', async () => {
    mocks.requireEventOwner.mockResolvedValue({
      error: NextResponse.json({ error: '権限がありません' }, { status: 403 }),
    });
    const response = await POST(postRequest(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    expect(response.status).toBe(403);
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });

  it('開催中イベントは manualEndAt を記録して 200', async () => {
    guardWith({});
    const response = await POST(postRequest(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    expect(response.status).toBe(200);
    expect(mocks.updateEvent).toHaveBeenCalledWith(EVENT_ID, {
      manualEndAt: expect.any(String),
    });
    const body = await response.json();
    expect(body.event.manualEndAt).toBe('2026-12-30T03:00:00.000Z');
  });

  it('既に受付済みなら冪等に 200（再記録しない）', async () => {
    guardWith({ manualEndAt: '2026-12-30T01:00:00.000Z' });
    const response = await POST(postRequest(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    expect(response.status).toBe(200);
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });

  it('終了処理済みなら 409 で記録しない', async () => {
    guardWith({ status: 'ended', finalizedAt: '2026-12-30T02:00:00.000Z' });
    const response = await POST(postRequest(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    expect(response.status).toBe(409);
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });

  it('下書きは 409 で記録しない（開催中だけ終了できる）', async () => {
    guardWith({ status: 'draft' });
    const response = await POST(postRequest(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    expect(response.status).toBe(409);
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });
});

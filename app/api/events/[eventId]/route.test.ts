// app/api/events/[eventId]/route.test.ts
// DELETE が「主催者本人の確認（requireEventOwner）」を通し、
// 削除できる状態（下書き・終了）でのみ完全削除を実行することを検証する。
// 開催中は 409 で止まり、削除は一切呼ばれない。
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireEventOwner: vi.fn(),
  deleteEventCompletely: vi.fn(),
  getUidFromRequest: vi.fn(),
  passwordChangeBlock: vi.fn(),
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock('@/lib/event-auth', () => ({
  getUidFromRequest: mocks.getUidFromRequest,
  passwordChangeBlock: mocks.passwordChangeBlock,
  requireEventOwner: mocks.requireEventOwner,
}));
vi.mock('@/lib/event-store', () => ({
  getEvent: mocks.getEvent,
  updateEvent: mocks.updateEvent,
  deleteEventCompletely: mocks.deleteEventCompletely,
}));

import { DELETE, PATCH } from './route';

const EVENT_ID = 'event-1';

function deleteRequest() {
  return new Request(`http://localhost/api/events/${EVENT_ID}`, {
    method: 'DELETE',
  });
}

function guardWith(status: string) {
  mocks.requireEventOwner.mockResolvedValue({
    uid: 'owner-1',
    event: { id: EVENT_ID, status },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteEventCompletely.mockResolvedValue(undefined);
});

describe('DELETE /api/events/[eventId]', () => {
  it('本人確認で弾かれたらそのエラーを返し、削除しない', async () => {
    mocks.requireEventOwner.mockResolvedValue({
      error: NextResponse.json({ error: '権限がありません' }, { status: 403 }),
    });
    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    expect(response.status).toBe(403);
    expect(mocks.deleteEventCompletely).not.toHaveBeenCalled();
  });

  it('開催中は 409 で削除できない', async () => {
    guardWith('live');
    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    expect(response.status).toBe(409);
    expect(mocks.deleteEventCompletely).not.toHaveBeenCalled();
  });

  it('下書きは削除できる', async () => {
    guardWith('draft');
    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(mocks.deleteEventCompletely).toHaveBeenCalledWith(EVENT_ID);
  });

  it('終了したイベントは削除できる', async () => {
    guardWith('ended');
    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    expect(response.status).toBe(200);
    expect(mocks.deleteEventCompletely).toHaveBeenCalledWith(EVENT_ID);
  });

  it('削除処理が失敗したら 500 を返す', async () => {
    guardWith('draft');
    mocks.deleteEventCompletely.mockRejectedValue(new Error('storage error'));
    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    expect(response.status).toBe(500);
  });
});

describe('PATCH /api/events/[eventId]（終了日「未定」）', () => {
  const ownedEvent = {
    id: EVENT_ID,
    ownerUid: 'owner-1',
    startDate: '2026-12-20',
    endDate: '2026-12-31',
    status: 'draft',
    finalizedAt: null,
  };

  function patchRequest(body: Record<string, unknown>) {
    return new Request(`http://localhost/api/events/${EVENT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    mocks.getUidFromRequest.mockResolvedValue('owner-1');
    mocks.passwordChangeBlock.mockResolvedValue(null);
    mocks.getEvent.mockResolvedValue(ownedEvent);
    mocks.updateEvent.mockResolvedValue(undefined);
  });

  it('未定にすると終了日がシーズン終了日（翌年1月31日）に寄せられる', async () => {
    // PATCH の戻り値型には既存実装の都合で undefined が含まれるため ?. で受ける
    const response = await PATCH(patchRequest({ endDateUndecided: true }), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    expect(response?.status).toBe(200);
    expect(mocks.updateEvent).toHaveBeenCalledWith(
      EVENT_ID,
      expect.objectContaining({
        endDateUndecided: true,
        endDate: '2027-01-31',
      }),
    );
  });

  it('manualEndAt は PATCH では変更できない（変更項目なしとして 400）', async () => {
    const response = await PATCH(
      patchRequest({ manualEndAt: '2026-12-30T00:00:00.000Z' }),
      { params: Promise.resolve({ eventId: EVENT_ID }) },
    );
    expect(response?.status).toBe(400);
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });
});

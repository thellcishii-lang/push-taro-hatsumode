// lib/event-member-auth.test.ts
// 端末認証のみの本人キー導出と、端末会員の memberId がクーポンの
// 各キーにそのまま流れること（取得・消込の作法で扱えること）を検証する。
import { describe, expect, it } from 'vitest';
import { resolveMemberIdFromClaims } from './event-member-auth';
import { claimIdFor, memberIdForDevice } from './event-coupon';

const DEVICE_UID = 'anon-uid-xyz';

describe('resolveMemberIdFromClaims（端末認証のみ）', () => {
  it('uid から端末の memberId を導く', () => {
    expect(resolveMemberIdFromClaims({ uid: DEVICE_UID })).toBe(
      memberIdForDevice(DEVICE_UID),
    );
  });

  it('電話番号がクレームにあっても端末キーで導く（電話はキーにしない）', () => {
    expect(
      resolveMemberIdFromClaims({ uid: DEVICE_UID, phone_number: '+819012345678' } as never),
    ).toBe(memberIdForDevice(DEVICE_UID));
  });

  it('uid の無いトークンは本人として扱わない', () => {
    expect(resolveMemberIdFromClaims({})).toBeNull();
    expect(resolveMemberIdFromClaims({ uid: '' })).toBeNull();
    expect(resolveMemberIdFromClaims({ uid: 123 })).toBeNull();
  });

  it('memberId は決定的で uid そのものを含まない', () => {
    expect(memberIdForDevice(DEVICE_UID)).toBe(memberIdForDevice(DEVICE_UID));
    expect(memberIdForDevice(DEVICE_UID)).not.toContain(DEVICE_UID);
    expect(memberIdForDevice(DEVICE_UID)).not.toBe(memberIdForDevice('another-uid'));
  });
});

describe('端末会員の memberId の流れ（クーポン）', () => {
  const deviceMemberId = memberIdForDevice(DEVICE_UID);

  it('取得記録のキーが端末会員でも組み立てられる', () => {
    expect(claimIdFor(deviceMemberId, 'coupon-1')).toBe(`${deviceMemberId}_coupon-1`);
  });
});

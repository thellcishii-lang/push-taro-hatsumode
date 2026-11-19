import { describe, expect, it } from 'vitest';
import { resolveEffectiveCaps, shouldBlockForPasswordChange } from './organizers';

describe('shouldBlockForPasswordChange', () => {
  it('レコードが無いユーザー（運営等）はブロックしない', () => {
    expect(shouldBlockForPasswordChange(null)).toBe(false);
  });
  it('mustChangePassword が立っていればブロックする', () => {
    expect(shouldBlockForPasswordChange({ mustChangePassword: true })).toBe(true);
  });
  it('mustChangePassword が下りていればブロックしない', () => {
    expect(shouldBlockForPasswordChange({ mustChangePassword: false })).toBe(false);
  });
});

describe('resolveEffectiveCaps', () => {
  it('契約者レコードがあれば契約枠を使う（イベント作成時の継承）', () => {
    expect(resolveEffectiveCaps({ subscriberCap: 200000, couponCap: 100 })).toEqual({
      subscriberCap: 200000,
      couponCap: 100,
    });
  });
  it('契約者レコードが無ければ既定値（購読者50,000 / クーポン100）', () => {
    expect(resolveEffectiveCaps(null)).toEqual({
      subscriberCap: 50000,
      couponCap: 100,
    });
  });
  it('契約枠が無制限（null）のときはイベントの表示枠として既定値を使う', () => {
    expect(resolveEffectiveCaps({ subscriberCap: null, couponCap: 100 })).toEqual({
      subscriberCap: 50000,
      couponCap: 100,
    });
  });
  it('500k の料金段階の枠（500,000）をそのまま使う', () => {
    expect(resolveEffectiveCaps({ subscriberCap: 500000, couponCap: 100 })).toEqual({
      subscriberCap: 500000,
      couponCap: 100,
    });
  });
});

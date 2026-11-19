import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  HANDOFF_TTL_SECONDS,
  buildHonkeHandoffUrl,
  createHandoffToken,
  honkeHandoffSecret,
} from './honke-handoff';

const SECRET = 'test-secret-value';
const NOW = 1_800_000_000;

function decodePayload(token: string): Record<string, unknown> {
  const [payloadPart] = token.split('.');
  return JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
}

describe('createHandoffToken', () => {
  it('builds a signed token the honke verifier format accepts', () => {
    const token = createHandoffToken(
      { contractId: 'shop-1', purpose: 'account', nonce: 'fixed-nonce' },
      SECRET,
      NOW
    );
    const [payloadPart, signature] = token.split('.');
    const expected = createHmac('sha256', SECRET).update(payloadPart).digest('base64url');
    expect(signature).toBe(expected);
    expect(decodePayload(token)).toEqual({
      v: 1,
      contractId: 'shop-1',
      purpose: 'account',
      exp: NOW + HANDOFF_TTL_SECONDS,
      nonce: 'fixed-nonce',
    });
  });

  it('includes the eventId for coupon-option tokens', () => {
    const token = createHandoffToken(
      { contractId: 'shop-1', purpose: 'coupon-option', eventId: 'ev-9', nonce: 'n' },
      SECRET,
      NOW
    );
    expect(decodePayload(token).eventId).toBe('ev-9');
  });

  it('generates a random nonce when not specified', () => {
    const a = createHandoffToken({ contractId: 's', purpose: 'account' }, SECRET, NOW);
    const b = createHandoffToken({ contractId: 's', purpose: 'account' }, SECRET, NOW);
    expect(decodePayload(a).nonce).not.toBe(decodePayload(b).nonce);
  });
});

describe('buildHonkeHandoffUrl', () => {
  it('points account links at /hatsumode-account', () => {
    const url = buildHonkeHandoffUrl({ contractId: 'shop-1', purpose: 'account' }, SECRET, NOW);
    expect(url.startsWith('https://push-taro.com/hatsumode-account?handoff=')).toBe(true);
  });

  it('points coupon-option links at /hatsumode-option with the eventId', () => {
    const url = buildHonkeHandoffUrl(
      { contractId: 'shop-1', purpose: 'coupon-option', eventId: 'ev 1' },
      SECRET,
      NOW
    );
    expect(url.startsWith('https://push-taro.com/hatsumode-option?eventId=ev%201&handoff=')).toBe(
      true
    );
  });
});

describe('honkeHandoffSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers HATSUMODE_HANDOFF_SECRET over the legacy name', () => {
    vi.stubEnv('HATSUMODE_HANDOFF_SECRET', 'hatsumode-secret');
    vi.stubEnv('HONKE_HANDOFF_SECRET', 'legacy-secret');
    expect(honkeHandoffSecret()).toBe('hatsumode-secret');
  });

  it('falls back to HONKE_HANDOFF_SECRET when the hatsumode one is unset or empty', () => {
    vi.stubEnv('HATSUMODE_HANDOFF_SECRET', '');
    vi.stubEnv('HONKE_HANDOFF_SECRET', 'legacy-secret');
    expect(honkeHandoffSecret()).toBe('legacy-secret');
  });

  it('returns null when neither is set', () => {
    vi.stubEnv('HATSUMODE_HANDOFF_SECRET', '');
    vi.stubEnv('HONKE_HANDOFF_SECRET', '');
    expect(honkeHandoffSecret()).toBeNull();
  });
});

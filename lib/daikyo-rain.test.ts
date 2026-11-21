// lib/daikyo-rain.test.ts
import { describe, expect, it } from 'vitest';
import { DAIKYO_RAIN_COUNT, buildDaikyoRain } from './daikyo-rain';

describe('buildDaikyoRain', () => {
  it('指定した本数ぶんの仕様を返す', () => {
    expect(buildDaikyoRain(DAIKYO_RAIN_COUNT, () => 0.5)).toHaveLength(
      DAIKYO_RAIN_COUNT,
    );
    expect(buildDaikyoRain(3, () => 0.5)).toHaveLength(3);
    expect(buildDaikyoRain(0, () => 0.5)).toHaveLength(0);
  });

  it('乱数 0.5 では各値が想定範囲の中央に来る', () => {
    const [streak] = buildDaikyoRain(1, () => 0.5);
    expect(streak.left).toBe('50%');
    expect(streak.height).toBe(45);
    expect(streak.duration).toBe('1.2s');
    expect(streak.delay).toBe('0.8s');
    expect(streak.opacity).toBe(0.575);
  });

  it('乱数 0 と 1（上限）で範囲の端に収まる', () => {
    const [min] = buildDaikyoRain(1, () => 0);
    expect(min.left).toBe('0%');
    expect(min.height).toBe(26);
    expect(min.duration).toBe('0.9s');
    expect(min.delay).toBe('0s');
    expect(min.opacity).toBe(0.35);

    const [nearMax] = buildDaikyoRain(1, () => 0.999999);
    expect(parseFloat(nearMax.left)).toBeLessThan(100);
    expect(nearMax.height).toBeLessThan(64);
    expect(parseFloat(nearMax.duration)).toBeLessThan(1.5);
    expect(parseFloat(nearMax.delay)).toBeLessThan(1.6);
    expect(nearMax.opacity).toBeLessThan(0.8);
  });

  it('実乱数でも全ての値が範囲内にある', () => {
    for (const streak of buildDaikyoRain(200)) {
      expect(parseFloat(streak.left)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(streak.left)).toBeLessThan(100);
      expect(streak.height).toBeGreaterThanOrEqual(26);
      expect(streak.height).toBeLessThan(64);
      expect(parseFloat(streak.duration)).toBeGreaterThanOrEqual(0.9);
      expect(parseFloat(streak.duration)).toBeLessThan(1.5);
      expect(parseFloat(streak.delay)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(streak.delay)).toBeLessThan(1.6);
      expect(streak.opacity).toBeGreaterThanOrEqual(0.35);
      expect(streak.opacity).toBeLessThan(0.8);
    }
  });
});

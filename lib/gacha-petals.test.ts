// lib/gacha-petals.test.ts
import { describe, expect, it } from 'vitest';
import {
  GACHA_PETAL_COLORS,
  GACHA_PETAL_COUNT,
  buildGachaPetals,
} from './gacha-petals';

describe('buildGachaPetals', () => {
  it('指定した枚数ぶんの仕様を返す', () => {
    expect(buildGachaPetals(GACHA_PETAL_COUNT, () => 0.5)).toHaveLength(
      GACHA_PETAL_COUNT,
    );
    expect(buildGachaPetals(3, () => 0.5)).toHaveLength(3);
    expect(buildGachaPetals(0, () => 0.5)).toHaveLength(0);
  });

  it('乱数 0.5 では各値が想定範囲の中央に来る', () => {
    const [petal] = buildGachaPetals(1, () => 0.5);
    expect(petal.left).toBe('50%');
    expect(petal.size).toBe(13.5);
    expect(petal.duration).toBe('3.6s');
    expect(petal.delay).toBe('0.7s');
    expect(petal.drift).toBe('0vw');
  });

  it('乱数 0 と 1（上限）で範囲の端に収まる', () => {
    const [min] = buildGachaPetals(1, () => 0);
    expect(min.left).toBe('0%');
    expect(min.size).toBe(9);
    expect(min.duration).toBe('2.6s');
    expect(min.delay).toBe('0s');
    expect(min.drift).toBe('-7vw');

    const [nearMax] = buildGachaPetals(1, () => 0.999999);
    expect(parseFloat(nearMax.left)).toBeLessThan(100);
    expect(nearMax.size).toBeLessThan(18);
    expect(parseFloat(nearMax.duration)).toBeLessThan(4.6);
    expect(parseFloat(nearMax.delay)).toBeLessThan(1.4);
    expect(parseFloat(nearMax.drift)).toBeLessThan(7);
  });

  it('色はパレットを順番に繰り返す', () => {
    const petals = buildGachaPetals(GACHA_PETAL_COLORS.length + 2, () => 0.5);
    petals.forEach((petal, i) => {
      expect(petal.color).toBe(GACHA_PETAL_COLORS[i % GACHA_PETAL_COLORS.length]);
    });
  });

  it('既定の乱数（Math.random）でも全枚が範囲内に収まる', () => {
    for (const petal of buildGachaPetals(50)) {
      expect(parseFloat(petal.left)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(petal.left)).toBeLessThan(100);
      expect(petal.size).toBeGreaterThanOrEqual(9);
      expect(petal.size).toBeLessThan(18);
      expect(parseFloat(petal.duration)).toBeGreaterThanOrEqual(2.6);
      expect(parseFloat(petal.duration)).toBeLessThan(4.6);
      expect(parseFloat(petal.delay)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(petal.delay)).toBeLessThan(1.4);
      expect(Math.abs(parseFloat(petal.drift))).toBeLessThanOrEqual(7);
      expect(GACHA_PETAL_COLORS).toContain(petal.color);
    }
  });
});

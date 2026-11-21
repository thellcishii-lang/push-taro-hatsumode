// lib/omikuji-content.test.ts
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './i18n';
import {
  FORTUNE_CATEGORIES,
  OMIKUJI_CONTENT,
  OMIKUJI_GRADES,
  OMIKUJI_TOTAL_WEIGHT,
  SHEEP_REACTION_LINES,
  drawOmikujiGrade,
  isOmikujiGrade,
  reactionForGrade,
} from './omikuji-content';

describe('OMIKUJI_CONTENT', () => {
  it('重みの合計は100（吉系7割・凶系3割）', () => {
    expect(OMIKUJI_TOTAL_WEIGHT).toBe(100);
    const goodWeight = OMIKUJI_GRADES.slice(0, 7).reduce(
      (sum, g) => sum + OMIKUJI_CONTENT[g].weight,
      0,
    );
    const badWeight = OMIKUJI_GRADES.slice(7).reduce(
      (sum, g) => sum + OMIKUJI_CONTENT[g].weight,
      0,
    );
    expect(goodWeight).toBe(70);
    expect(badWeight).toBe(30);
  });

  it('全運勢に4言語すべての文面と指数が入っている', () => {
    for (const grade of OMIKUJI_GRADES) {
      const content = OMIKUJI_CONTENT[grade];
      for (const locale of SUPPORTED_LOCALES) {
        expect(content.name[locale].trim().length, `${grade}.name.${locale}`).toBeGreaterThan(0);
        expect(content.overall[locale].trim().length, `${grade}.overall.${locale}`).toBeGreaterThan(0);
        expect(content.luckyItem[locale].trim().length, `${grade}.luckyItem.${locale}`).toBeGreaterThan(0);
        expect(content.luckyColor[locale].trim().length, `${grade}.luckyColor.${locale}`).toBeGreaterThan(0);
        for (const category of FORTUNE_CATEGORIES) {
          const fortune = content.categories[category];
          expect(fortune.level, `${grade}.${category}.level`).toBeGreaterThanOrEqual(1);
          expect(fortune.level, `${grade}.${category}.level`).toBeLessThanOrEqual(5);
          expect(fortune.text[locale].trim().length, `${grade}.${category}.${locale}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('羊の反応セリフが4言語すべて入っている', () => {
    for (const lines of Object.values(SHEEP_REACTION_LINES)) {
      for (const locale of SUPPORTED_LOCALES) {
        expect(lines[locale].trim().length).toBeGreaterThan(0);
      }
    }
    expect(SHEEP_REACTION_LINES.daikyo.ja).toBe('今年の悪い事を全て使い果たしたね！');
  });
});

describe('drawOmikujiGrade', () => {
  it('random()=0 なら大吉、1に近いほど大凶に寄る', () => {
    expect(drawOmikujiGrade(() => 0)).toBe('daikichi');
    expect(drawOmikujiGrade(() => 0.999)).toBe('daikyo');
  });

  it('累積重みの境界で次に移る（大吉の上限は12）', () => {
    expect(drawOmikujiGrade(() => 0.119)).toBe('daikichi');
    expect(drawOmikujiGrade(() => 0.12)).toBe('chukichi');
  });

  it('全運勢に到達可能', () => {
    let cumulative = 0;
    for (const grade of OMIKUJI_GRADES) {
      const mid = (cumulative + OMIKUJI_CONTENT[grade].weight / 2) / 100;
      expect(drawOmikujiGrade(() => mid)).toBe(grade);
      cumulative += OMIKUJI_CONTENT[grade].weight;
    }
  });
});

describe('reactionForGrade / isOmikujiGrade', () => {
  it('運勢の帯ごとに羊の反応が決まる', () => {
    expect(reactionForGrade('daikichi')).toBe('rejoice');
    expect(reactionForGrade('chukichi')).toBe('happy');
    expect(reactionForGrade('kichi')).toBe('happy');
    expect(reactionForGrade('suekichi')).toBe('calm');
    expect(reactionForGrade('kyo')).toBe('solemn');
    expect(reactionForGrade('suekyo')).toBe('solemn');
    expect(reactionForGrade('daikyo')).toBe('daikyo');
  });

  it('isOmikujiGrade は既知の運勢だけを通す', () => {
    expect(isOmikujiGrade('daikichi')).toBe(true);
    expect(isOmikujiGrade('daikyo')).toBe(true);
    expect(isOmikujiGrade('unknown')).toBe(false);
    expect(isOmikujiGrade(null)).toBe(false);
    expect(isOmikujiGrade(undefined)).toBe(false);
  });
});

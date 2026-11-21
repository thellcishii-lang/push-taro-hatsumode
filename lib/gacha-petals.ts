// lib/gacha-petals.ts
// ガチャ当選時の花びら演出（components/GachaPetals.tsx）用の、花びら1枚
// ごとの見た目仕様を作る純粋関数。町おこしのスタンプ達成セレブレーション
// （StampCelebration）と同じ考え方で、色だけ初詣パレット（朱・金・桜色）
// に合わせている。乱数は差し替え可能にしてテストできるようにする。

export interface PetalSpec {
  /** 横位置（画面幅に対する %） */
  left: string;
  /** 幅 px（9〜18） */
  size: number;
  /** 落下時間（2.6s〜4.6s） */
  duration: string;
  /** 出現遅延（0s〜1.4s） */
  delay: string;
  /** 花びらの色 */
  color: string;
  /** 横流れ（±7vw） */
  drift: string;
}

/** 初詣パレットの花びら色（朱・金・桜色） */
export const GACHA_PETAL_COLORS = [
  '#B3352B',
  '#D9A441',
  '#F2B8C6',
  '#E87A90',
  '#F7D774',
] as const;

/** 画面に出す花びらの枚数 */
export const GACHA_PETAL_COUNT = 26;

/**
 * 花びらの仕様を count 枚分作る。色はパレットを順番に繰り返す。
 * random は 0〜1 の乱数関数（既定は Math.random）。
 */
export function buildGachaPetals(
  count: number,
  random: () => number = Math.random,
): PetalSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    left: `${random() * 100}%`,
    size: 9 + random() * 9,
    duration: `${2.6 + random() * 2}s`,
    delay: `${random() * 1.4}s`,
    color: GACHA_PETAL_COLORS[i % GACHA_PETAL_COLORS.length],
    drift: `${(random() - 0.5) * 14}vw`,
  }));
}

// lib/daikyo-rain.ts
// おみくじで大凶を引いた時の「線が上からザザーッと降ってくる」演出
// （components/DaikyoRain.tsx）用の、雨の線1本ごとの見た目仕様を作る
// 純粋関数。ガチャの花びら（lib/gacha-petals.ts）と同じ考え方。
// 乱数は差し替え可能にしてテストできるようにする。

export interface RainStreakSpec {
  /** 横位置（幅に対する %） */
  left: string;
  /** 線の長さ px（26〜64） */
  height: number;
  /** 落下時間（0.9s〜1.5s） */
  duration: string;
  /** 出現遅延（0s〜1.6s） */
  delay: string;
  /** 濃さ（0.35〜0.8） */
  opacity: number;
}

/** 画面に出す雨の線の本数 */
export const DAIKYO_RAIN_COUNT = 18;

/** 雨の線の仕様を count 本分作る。random は 0〜1 の乱数関数。 */
export function buildDaikyoRain(
  count: number,
  random: () => number = Math.random,
): RainStreakSpec[] {
  return Array.from({ length: count }, () => ({
    left: `${random() * 100}%`,
    height: 26 + random() * 38,
    duration: `${0.9 + random() * 0.6}s`,
    delay: `${random() * 1.6}s`,
    opacity: 0.35 + random() * 0.45,
  }));
}

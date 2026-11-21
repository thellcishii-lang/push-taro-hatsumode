'use client';

// components/GachaPetals.tsx
// ガチャ当選の瞬間に画面いっぱいへ花びらを舞わせる演出（当選直後だけ、
// 結果の表示を邪魔しない全面レイヤー）。町おこしのスタンプ達成
// セレブレーション（StampCelebration）と同じ構成で、色は初詣パレット。
// 花びらは約4.6秒で止まる。prefers-reduced-motion の端末では出さない。
import { useEffect, useMemo, useState } from 'react';
import { GACHA_PETAL_COUNT, buildGachaPetals } from '@/lib/gacha-petals';

export function GachaPetals() {
  const [reducedMotion, setReducedMotion] = useState(false);
  // 花びらは時間で止める（結果カード自体はそのまま残る）
  const [petalsVisible, setPetalsVisible] = useState(true);
  const petals = useMemo(() => buildGachaPetals(GACHA_PETAL_COUNT), []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) =>
      setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setPetalsVisible(false), 4600);
    return () => window.clearTimeout(timer);
  }, []);

  if (!petalsVisible || reducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {petals.map((petal, i) => (
        <span
          key={i}
          style={
            {
              position: 'absolute',
              top: -24,
              left: petal.left,
              width: petal.size,
              height: petal.size * 0.82,
              backgroundColor: petal.color,
              // 花びらの形（対角だけ丸くする）
              borderRadius: '90% 0 90% 0',
              opacity: 0,
              '--petal-drift': petal.drift,
              animation: `gacha-petal-fall ${petal.duration} linear ${petal.delay} forwards`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

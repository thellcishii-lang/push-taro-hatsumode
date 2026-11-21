'use client';

// components/DaikyoRain.tsx
// おみくじで大凶を引いた時の反応カードの中に、雨の線を上から降らせる
// 演出。カードの外には出ない（親が position: relative で受ける）。
// prefers-reduced-motion の端末では出さない。
import { useEffect, useMemo, useState } from 'react';
import { DAIKYO_RAIN_COUNT, buildDaikyoRain } from '@/lib/daikyo-rain';

export function DaikyoRain() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const streaks = useMemo(() => buildDaikyoRain(DAIKYO_RAIN_COUNT), []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) =>
      setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  if (reducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {streaks.map((streak, i) => (
        <span
          key={i}
          style={
            {
              position: 'absolute',
              top: -70,
              left: streak.left,
              width: 2,
              height: streak.height,
              borderRadius: 999,
              backgroundColor: '#7C8DA6',
              opacity: 0,
              '--rain-opacity': streak.opacity,
              animation: `daikyo-rain-fall ${streak.duration} linear ${streak.delay} infinite`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

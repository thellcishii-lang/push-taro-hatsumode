'use client';

// components/NewYearSheepGreeting.tsx
// 元日の羊の挨拶オーバーレイ（1月1日の初回起動時のみ・表示判定は
// lib/new-year-greeting.ts）。開くと羊が画面にいて、タップすると
// 「メェー」と鳴いて（WebAudio で合成した鳴き声。外部音源なし）
// 「あけましておめでとうございます」を出してから通常画面に戻る。
// タップの瞬間に表示済みフラグを端末へ保存する（サーバーには持たない）。
import { useEffect, useRef, useState } from 'react';
import { uiText } from '@/lib/ui-text';
import type { Locale } from '@/lib/i18n';
import { newYearGreetingStorageKey } from '@/lib/new-year-greeting';
import { SheepCharacter } from './SheepCharacter';

const ACCENT = '#B3352B';
const INK = '#2A1E17';

/**
 * 羊の鳴き声を WebAudio で合成する。「メェー」の震えた感じは、
 * ノコギリ波を低めに滑らせながら振幅を約28Hzで揺らして作る。
 * 音が出ない環境でも挨拶の流れは止めない。
 */
function playBaa() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const duration = 0.7;
    const start = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(640, start);
    osc.frequency.exponentialRampToValueAtTime(430, start + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.16, start + 0.06);
    gain.gain.setValueAtTime(0.16, start + duration - 0.14);
    gain.gain.linearRampToValueAtTime(0, start + duration);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 28;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.085;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    lfo.start(start);
    osc.stop(start + duration);
    lfo.stop(start + duration);
    osc.onended = () => {
      void ctx.close().catch(() => {});
    };
  } catch {
    // 音が出なくても挨拶は続ける
  }
}

export function NewYearSheepGreeting({
  locale,
  onClose,
}: {
  locale: Locale;
  onClose: () => void;
}) {
  const [greeted, setGreeted] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleTap = () => {
    if (greeted) return;
    try {
      window.localStorage.setItem(
        newYearGreetingStorageKey(new Date().getFullYear()),
        'shown',
      );
    } catch {
      // 保存できなくても挨拶は進める（この起動内では二重に出ない）
    }
    playBaa();
    try {
      navigator.vibrate?.(120);
    } catch {
      // 振動が使えない環境では何もしない
    }
    setGreeted(true);
    timerRef.current = window.setTimeout(onClose, 2100);
  };

  return (
    <div
      role="dialog"
      aria-label={uiText(locale, 'newYearGreeting')}
      onClick={handleTap}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'linear-gradient(160deg, #F7E8CF, #F3D9A4 55%, #EDBE78)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      <div style={{ animation: 'sheep-pop 0.5s ease-out' }}>
        <SheepCharacter mood={greeted ? 'rejoice' : 'greeting'} size={230} />
      </div>
      {greeted ? (
        <>
          <p
            style={{
              fontSize: 30,
              fontWeight: 900,
              color: ACCENT,
              margin: '18px 0 0',
            }}
          >
            {uiText(locale, 'sheepBaa')}
          </p>
          <p
            style={{
              fontSize: 21,
              fontWeight: 800,
              color: INK,
              margin: '10px 0 0',
              lineHeight: 1.5,
            }}
          >
            {uiText(locale, 'newYearGreeting')}
          </p>
        </>
      ) : (
        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#5c4a3a',
            margin: '18px 0 0',
          }}
        >
          {uiText(locale, 'sheepTapHint')}
        </p>
      )}
    </div>
  );
}

// components/SheepCharacter.tsx
// 初詣の羊キャラ（2027年・未年）。外部アセットを使わず SVG で描く。
// 毛は初詣パレットの生成り＋金、顔は焦げ茶、首には金の鈴、
// 気分によって朱のリボンを付ける。表情は mood で切り替える:
// - rejoice: 大吉。目を閉じて喜び、跳ねるアニメーション
// - happy / greeting: 笑顔でゆらゆら
// - calm: 穏やかな表情でゆっくり揺れる
// - solemn: 伏し目で静かに励ます
// - daikyo: 大凶。耳が垂れて落ち込む（涙つき）
// アニメーションの keyframes は app/globals.css にある。
import type { SheepReaction } from '@/lib/omikuji-content';

export type SheepMood = SheepReaction | 'greeting';

const WOOL = '#FFFBF2';
const WOOL_STROKE = '#E9D6AE';
const FACE = '#6B4A2F';
const INK = '#2A1E17';
const ACCENT = '#B3352B';
const GOLD = '#D9A441';
const GOLD_DARK = '#A8742A';

const ANIMATIONS: Record<SheepMood, string> = {
  rejoice: 'sheep-bounce 0.9s ease-in-out infinite',
  happy: 'sheep-sway 2.4s ease-in-out infinite',
  greeting: 'sheep-sway 2.4s ease-in-out infinite',
  calm: 'sheep-sway 3.4s ease-in-out infinite',
  solemn: 'sheep-droop 2.8s ease-in-out infinite',
  daikyo: 'sheep-droop 2s ease-in-out infinite',
};

function Eyes({ mood }: { mood: SheepMood }) {
  const strokeProps = {
    stroke: INK,
    strokeWidth: 3.4,
    fill: 'none',
    strokeLinecap: 'round' as const,
  };
  if (mood === 'rejoice' || mood === 'happy' || mood === 'greeting') {
    // 喜びの閉じ目（上に凸の弧）
    return (
      <>
        <path d="M86 106 Q95 97 104 106" {...strokeProps} />
        <path d="M116 106 Q125 97 134 106" {...strokeProps} />
      </>
    );
  }
  if (mood === 'daikyo') {
    // 落ち込んだ閉じ目（下に凸の弧）
    return (
      <>
        <path d="M86 104 Q95 111 104 104" {...strokeProps} />
        <path d="M116 104 Q125 111 134 104" {...strokeProps} />
      </>
    );
  }
  // calm / solemn: 点の目
  return (
    <>
      <circle cx="95" cy="105" r="3.6" fill={INK} />
      <circle cx="125" cy="105" r="3.6" fill={INK} />
    </>
  );
}

function Mouth({ mood }: { mood: SheepMood }) {
  const strokeProps = {
    stroke: INK,
    strokeWidth: 3,
    fill: 'none',
    strokeLinecap: 'round' as const,
  };
  if (mood === 'rejoice') {
    return <ellipse cx="110" cy="121" rx="7.5" ry="5.5" fill="#7C2D22" />;
  }
  if (mood === 'happy' || mood === 'greeting' || mood === 'calm') {
    return <path d="M101 118 Q110 126 119 118" {...strokeProps} />;
  }
  if (mood === 'daikyo') {
    // への字口
    return <path d="M103 124 Q110 118 117 124" {...strokeProps} />;
  }
  // solemn: まっすぐな口
  return <path d="M103 121 H117" {...strokeProps} />;
}

export function SheepCharacter({
  mood,
  size = 180,
}: {
  mood: SheepMood;
  size?: number;
}) {
  const droopy = mood === 'daikyo';
  const withBow = mood === 'rejoice' || mood === 'greeting';
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size * (190 / 220),
        animation: ANIMATIONS[mood],
        transformOrigin: '50% 90%',
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 220 190">
        {/* 脚 */}
        <rect x="80" y="146" width="13" height="28" rx="6" fill="#7A5B3E" />
        <rect x="127" y="146" width="13" height="28" rx="6" fill="#7A5B3E" />
        {/* 体の毛 */}
        <g fill={WOOL} stroke={WOOL_STROKE} strokeWidth="2">
          <ellipse cx="110" cy="106" rx="62" ry="45" />
          <circle cx="60" cy="86" r="20" />
          <circle cx="80" cy="68" r="22" />
          <circle cx="110" cy="60" r="24" />
          <circle cx="140" cy="68" r="22" />
          <circle cx="160" cy="86" r="20" />
          <circle cx="58" cy="112" r="18" />
          <circle cx="162" cy="112" r="18" />
        </g>
        {/* 耳（大凶は垂れる） */}
        <ellipse
          cx="74"
          cy={droopy ? 108 : 96}
          rx="15"
          ry="7"
          fill={FACE}
          transform={`rotate(${droopy ? 52 : 24} 74 ${droopy ? 108 : 96})`}
        />
        <ellipse
          cx="146"
          cy={droopy ? 108 : 96}
          rx="15"
          ry="7"
          fill={FACE}
          transform={`rotate(${droopy ? -52 : -24} 146 ${droopy ? 108 : 96})`}
        />
        {/* 顔 */}
        <ellipse cx="110" cy="110" rx="30" ry="34" fill={FACE} />
        {/* 頭の毛 */}
        <g fill={WOOL} stroke={WOOL_STROKE} strokeWidth="2">
          <circle cx="88" cy="76" r="14" />
          <circle cx="110" cy="68" r="16" />
          <circle cx="132" cy="76" r="14" />
        </g>
        <Eyes mood={mood} />
        {/* 鼻 */}
        <circle cx="106" cy="113" r="1.8" fill="#4A3220" />
        <circle cx="114" cy="113" r="1.8" fill="#4A3220" />
        <Mouth mood={mood} />
        {/* 大凶の涙 */}
        {droopy && (
          <path
            d="M70 118 Q76 128 70 133 Q64 128 70 118 Z"
            fill="#7FB3D5"
            opacity="0.9"
          />
        )}
        {/* 金の鈴 */}
        <circle cx="110" cy="150" r="9" fill={GOLD} stroke={GOLD_DARK} strokeWidth="2" />
        <path d="M102 153 H118" stroke={GOLD_DARK} strokeWidth="2" />
        <circle cx="110" cy="157" r="2" fill={GOLD_DARK} />
        {/* 朱のリボン */}
        {withBow && (
          <g>
            <ellipse cx="93" cy="34" rx="13" ry="6.5" fill={ACCENT} transform="rotate(-28 93 34)" />
            <ellipse cx="127" cy="34" rx="13" ry="6.5" fill={ACCENT} transform="rotate(28 127 34)" />
            <circle cx="110" cy="36" r="5.5" fill="#8E2A21" />
          </g>
        )}
      </svg>
    </div>
  );
}

'use client';

// components/OmikujiSection.tsx
// 参拝者画面のおみくじセクション。期間中1端末1回だけ引ける。
// 演出の流れ: ボタンの後ろから羊が顔だけひょこっと → 引くと画面ごと
// ガシャガシャ（筒＋振動）→ 画面が真っ白に → 羊がドアップで横から
// 登場し、向こうへ歩いて振り返る（実録の鳴き声つき）→ 結果の詳細。
// 大吉は運勢名が画面いっぱいに大きく出て、大凶は雨の線が上から降る。
// 抽選済みの端末では、開くたびに同じ結果を表示する（引き直しはできない）。
// 運勢の文面は lib/omikuji-content.ts から画面の言語で引く。
import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Locale } from '@/lib/i18n';
import { uiText, type UiTextKey } from '@/lib/ui-text';
import {
  FORTUNE_CATEGORIES,
  OMIKUJI_CONTENT,
  SHEEP_REACTION_LINES,
  isOmikujiGrade,
  reactionForGrade,
  type FortuneCategory,
  type OmikujiGrade,
} from '@/lib/omikuji-content';
import { playSheepBaa, primeSheepBaa } from '@/lib/sheep-baa';
import { SheepCharacter } from './SheepCharacter';
import { DaikyoRain } from './DaikyoRain';

const ACCENT = '#B3352B';
const GOLD = '#D9A441';
const INK = '#2A1E17';

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  padding: 16,
};

const CATEGORY_LABEL_KEYS: Record<FortuneCategory, UiTextKey> = {
  money: 'fortuneMoney',
  love: 'fortuneLove',
  health: 'fortuneHealth',
  work: 'fortuneWork',
};

type Phase = 'loading' | 'not-drawn' | 'shaking' | 'flash' | 'reaction' | 'result';

function authHeaders(token: string): Record<string, string> {
  return { ['Authori' + 'zation']: 'Bearer ' + token };
}

function Stars({ level }: { level: number }) {
  return (
    <span style={{ color: GOLD, fontSize: 14, letterSpacing: 1 }} aria-label={`${level}/5`}>
      {'★'.repeat(level)}
      <span style={{ color: '#E3D9C6' }}>{'★'.repeat(5 - level)}</span>
    </span>
  );
}

export function OmikujiSection({
  eventId,
  locale,
  user,
}: {
  eventId: string;
  locale: Locale;
  user: User;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [grade, setGrade] = useState<OmikujiGrade | null>(null);
  const [error, setError] = useState('');
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // 抽選済みかどうかを最初に確認する（済みなら結果をそのまま出す）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/events/${eventId}/omikuji`, {
          headers: authHeaders(token),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.drawn && isOmikujiGrade(data.grade)) {
          setGrade(data.grade);
          setPhase('result');
        } else {
          setPhase('not-drawn');
        }
      } catch {
        if (!cancelled) setPhase('not-drawn');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, user]);

  const handleDraw = async () => {
    // タップの中で音源を先読みしておく（結果表示時の再生を iOS でも通すため）
    primeSheepBaa();
    setError('');
    setPhase('shaking');
    // 筒を振る感触として、対応端末では軽く振動させる
    try {
      navigator.vibrate?.(180);
    } catch {
      // 振動が使えない環境では何もしない
    }
    const startedAt = Date.now();
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/events/${eventId}/omikuji/draw`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !isOmikujiGrade(data.grade)) {
        setError(
          typeof data.error === 'string' && data.error
            ? data.error
            : uiText(locale, 'omikujiFailed'),
        );
        setPhase('not-drawn');
        return;
      }
      // 筒を振る演出は最低1.3秒見せる
      const wait = Math.max(0, 1300 - (Date.now() - startedAt));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setGrade(data.grade);
      if (data.alreadyDrawn) {
        setPhase('result');
        return;
      }
      // 演出: 画面が真っ白に → 羊が横から登場する反応へ
      setPhase('flash');
      const flashTimer = window.setTimeout(() => {
        setPhase('reaction');
        // 羊が画面に入ってきた頃に、実録の鳴き声を鳴らす
        const baaTimer = window.setTimeout(() => playSheepBaa(), 700);
        timersRef.current.push(baaTimer);
        const resultTimer = window.setTimeout(() => setPhase('result'), 3400);
        timersRef.current.push(resultTimer);
      }, 500);
      timersRef.current.push(flashTimer);
    } catch {
      setError(uiText(locale, 'omikujiFailed'));
      setPhase('not-drawn');
    }
  };

  const content = grade ? OMIKUJI_CONTENT[grade] : null;
  const reaction = grade ? reactionForGrade(grade) : null;

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800 }}>⛩ {uiText(locale, 'omikujiTitle')}</h2>

      {phase === 'loading' && (
        <div style={{ ...cardStyle, marginTop: 8 }}>
          <p style={{ fontSize: 14, margin: 0 }}>{uiText(locale, 'loading')}</p>
        </div>
      )}

      {phase === 'not-drawn' && (
        <div style={{ ...cardStyle, marginTop: 8, textAlign: 'center' }}>
          <p style={{ fontSize: 14, margin: 0 }}>{uiText(locale, 'omikujiIntro')}</p>
          {/* ボタンの後ろから、羊が顔だけひょこっと出す */}
          <div
            aria-hidden="true"
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: 12,
              marginBottom: -14,
              position: 'relative',
              zIndex: 0,
            }}
          >
            <div style={{ width: 120, height: 64, overflow: 'hidden' }}>
              <div style={{ animation: 'sheep-peek 2.6s ease-in-out infinite' }}>
                <SheepCharacter mood="greeting" size={120} />
              </div>
            </div>
          </div>
          <button
            onClick={() => void handleDraw()}
            style={{
              padding: '12px 24px',
              fontWeight: 700,
              fontSize: 15,
              width: '100%',
              marginTop: 14,
              backgroundColor: ACCENT,
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {uiText(locale, 'omikujiDrawButton')}
          </button>
          {error && (
            <p style={{ marginTop: 12, fontSize: 14, color: '#b91c1c', whiteSpace: 'pre-wrap' }}>
              {error}
            </p>
          )}
        </div>
      )}

      {phase === 'shaking' && (
        <div
          style={{
            ...cardStyle,
            marginTop: 8,
            textAlign: 'center',
            animation: 'omikuji-screen-shake 0.45s linear infinite',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 74,
              height: 120,
              margin: '6px auto 0',
              borderRadius: '14px 14px 18px 18px',
              background: 'linear-gradient(180deg, #C49A5C, #8A6A3C)',
              border: '2px solid #6E5327',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'omikuji-shake 0.55s ease-in-out infinite',
              transformOrigin: '50% 20%',
            }}
          >
            <span
              style={{
                writingMode: 'vertical-rl',
                color: '#FFF6E0',
                fontWeight: 800,
                fontSize: 17,
                letterSpacing: 3,
              }}
            >
              おみくじ
            </span>
          </div>
          <p style={{ fontSize: 14, margin: '14px 0 0' }}>{uiText(locale, 'omikujiDrawing')}</p>
        </div>
      )}

      {phase === 'flash' && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: '#ffffff',
            zIndex: 70,
            pointerEvents: 'none',
            animation: 'omikuji-flash-fade 0.5s ease-out both',
          }}
        />
      )}

      {phase === 'reaction' && content && reaction && (
        <div
          style={{
            ...cardStyle,
            marginTop: 8,
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {reaction === 'daikyo' && <DaikyoRain />}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <div style={{ animation: 'omikuji-sheep-scene 3.4s ease-in-out both' }}>
              <SheepCharacter mood={reaction} size={200} />
            </div>
          </div>
          <div
            style={{
              animation: 'omikuji-line-in 0.5s ease-out 2s both',
              position: 'relative',
            }}
          >
            <p
              style={{
                fontSize: reaction === 'rejoice' ? 58 : 30,
                fontWeight: 900,
                color: ACCENT,
                margin: '10px 0 0',
                lineHeight: 1.15,
              }}
            >
              {content.name[locale]}
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: INK, margin: '6px 0 0' }}>
              {SHEEP_REACTION_LINES[reaction][locale]}
            </p>
          </div>
        </div>
      )}

      {phase === 'result' && content && reaction && grade && (
        <div
          style={{
            marginTop: 8,
            borderRadius: 16,
            border: '1px solid #E9D6AE',
            background: 'linear-gradient(180deg, #FFFBF0, #FBF3E2)',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SheepCharacter mood={reaction} size={86} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#8A6A3C', margin: 0 }}>
                {uiText(locale, 'omikujiDrawnLabel')}
              </p>
              <p
                style={{
                  fontSize: 34,
                  fontWeight: 900,
                  color: ACCENT,
                  margin: '2px 0 0',
                  lineHeight: 1.1,
                }}
              >
                {content.name[locale]}
              </p>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '4px 0 0' }}>
                {SHEEP_REACTION_LINES[reaction][locale]}
              </p>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#8A6A3C', margin: 0 }}>
              {uiText(locale, 'omikujiOverallLabel')}
            </p>
            <p style={{ fontSize: 14.5, margin: '4px 0 0', lineHeight: 1.7 }}>
              {content.overall[locale]}
            </p>
          </div>

          <div style={{ marginTop: 12, borderTop: '1px dashed #E3D3AC', paddingTop: 10 }}>
            {FORTUNE_CATEGORIES.map((category) => {
              const fortune = content.categories[category];
              return (
                <div key={category} style={{ marginTop: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 800, minWidth: 52 }}>
                      {uiText(locale, CATEGORY_LABEL_KEYS[category])}
                    </span>
                    <Stars level={fortune.level} />
                  </div>
                  <p style={{ fontSize: 13.5, margin: '2px 0 0', lineHeight: 1.6, color: '#3E2F23' }}>
                    {fortune.text[locale]}
                  </p>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 12,
              borderTop: '1px dashed #E3D3AC',
              paddingTop: 10,
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap',
            }}
          >
            <p style={{ fontSize: 13.5, margin: 0 }}>
              <span style={{ fontWeight: 800 }}>{uiText(locale, 'luckyItemLabel')}</span>
              {'：'}
              {content.luckyItem[locale]}
            </p>
            <p style={{ fontSize: 13.5, margin: 0 }}>
              <span style={{ fontWeight: 800 }}>{uiText(locale, 'luckyColorLabel')}</span>
              {'：'}
              {content.luckyColor[locale]}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

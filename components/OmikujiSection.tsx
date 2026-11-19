'use client';

// components/OmikujiSection.tsx
// 参拝者画面のおみくじセクション。期間中1端末1回だけ引ける。
// 流れ: 引く → 筒を振るアニメーション → 羊の反応 → 結果の詳細。
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
import { SheepCharacter } from './SheepCharacter';

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

type Phase = 'loading' | 'not-drawn' | 'shaking' | 'reaction' | 'result';

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
    setError('');
    setPhase('shaking');
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
      setPhase('reaction');
      const timer = window.setTimeout(() => setPhase('result'), 2400);
      timersRef.current.push(timer);
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
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <SheepCharacter mood="greeting" size={120} />
          </div>
          <p style={{ fontSize: 14, margin: '8px 0 0' }}>{uiText(locale, 'omikujiIntro')}</p>
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
        <div style={{ ...cardStyle, marginTop: 8, textAlign: 'center' }}>
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

      {phase === 'reaction' && content && reaction && (
        <div style={{ ...cardStyle, marginTop: 8, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <SheepCharacter mood={reaction} size={170} />
          </div>
          <p style={{ fontSize: 19, fontWeight: 900, color: ACCENT, margin: '10px 0 0' }}>
            {content.name[locale]}
          </p>
          <p style={{ fontSize: 15, fontWeight: 700, color: INK, margin: '6px 0 0' }}>
            {SHEEP_REACTION_LINES[reaction][locale]}
          </p>
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

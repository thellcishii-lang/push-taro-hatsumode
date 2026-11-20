'use client';

// components/GachaSection.tsx
// 参拝者画面のガチャセクション。期間中1端末1回だけ回せる。
// 流れ: 回す → カプセルを振るアニメーション → 結果（当選なら景品と
// 交換用QRコード、ハズレならメッセージ）。
// 抽選済みの端末では、開くたびに同じ結果を表示する（引き直しはできない）。
// 当選QRの中身はクーポンの消込コードと同じ形式で、会場の消込画面で
// 読み取ると景品交換（消込）できる。
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';
import type { Locale } from '@/lib/i18n';
import { uiText } from '@/lib/ui-text';
import { SheepCharacter } from './SheepCharacter';

const ACCENT = '#B3352B';
const INK = '#2A1E17';

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  padding: 16,
};

type Phase = 'loading' | 'not-drawn' | 'spinning' | 'result';

interface GachaResult {
  rank: number | null;
  prizeName: string | null;
  code: string | null;
  redeemed: boolean;
}

function authHeaders(token: string): Record<string, string> {
  return { ['Authori' + 'zation']: 'Bearer ' + token };
}

function Capsule({ spinning }: { spinning: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 92,
        height: 92,
        margin: '4px auto 0',
        borderRadius: '50%',
        overflow: 'hidden',
        border: '2px solid #6E5327',
        display: 'flex',
        flexDirection: 'column',
        animation: spinning ? 'gacha-shake 0.5s ease-in-out infinite' : undefined,
      }}
    >
      <div style={{ flex: 1, background: 'linear-gradient(180deg, #D9534A, #B3352B)' }} />
      <div
        style={{
          flex: 1,
          background: 'linear-gradient(180deg, #FDF6E3, #F3E5C3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, color: '#8A6A3C', letterSpacing: 2 }}>
          ガチャ
        </span>
      </div>
    </div>
  );
}

export function GachaSection({
  eventId,
  locale,
  user,
}: {
  eventId: string;
  locale: Locale;
  user: User;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [result, setResult] = useState<GachaResult | null>(null);
  const [error, setError] = useState('');

  // 抽選済みかどうかを最初に確認する（済みなら結果をそのまま出す）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/events/${eventId}/gacha`, {
          headers: authHeaders(token),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.drawn) {
          setResult({
            rank: typeof data.rank === 'number' ? data.rank : null,
            prizeName: typeof data.prizeName === 'string' ? data.prizeName : null,
            code: typeof data.code === 'string' ? data.code : null,
            redeemed: data.redeemed === true,
          });
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
    setPhase('spinning');
    const startedAt = Date.now();
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/events/${eventId}/gacha/draw`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !('rank' in data)) {
        setError(
          typeof data.error === 'string' && data.error
            ? data.error
            : uiText(locale, 'gachaFailed'),
        );
        setPhase('not-drawn');
        return;
      }
      // カプセルを振る演出は最低1.1秒見せる
      const wait = Math.max(0, 1100 - (Date.now() - startedAt));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setResult({
        rank: typeof data.rank === 'number' ? data.rank : null,
        prizeName: typeof data.prizeName === 'string' ? data.prizeName : null,
        code: typeof data.code === 'string' ? data.code : null,
        redeemed: data.redeemed === true,
      });
      setPhase('result');
    } catch {
      setError(uiText(locale, 'gachaFailed'));
      setPhase('not-drawn');
    }
  };

  const won = result !== null && result.rank !== null && result.code !== null;

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800 }}>🎁 {uiText(locale, 'gachaTitle')}</h2>

      {phase === 'loading' && (
        <div style={{ ...cardStyle, marginTop: 8 }}>
          <p style={{ fontSize: 14, margin: 0 }}>{uiText(locale, 'loading')}</p>
        </div>
      )}

      {phase === 'not-drawn' && (
        <div style={{ ...cardStyle, marginTop: 8, textAlign: 'center' }}>
          <Capsule spinning={false} />
          <p style={{ fontSize: 14, margin: '10px 0 0' }}>{uiText(locale, 'gachaIntro')}</p>
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
            {uiText(locale, 'gachaDrawButton')}
          </button>
          {error && (
            <p style={{ marginTop: 12, fontSize: 14, color: '#b91c1c', whiteSpace: 'pre-wrap' }}>
              {error}
            </p>
          )}
        </div>
      )}

      {phase === 'spinning' && (
        <div style={{ ...cardStyle, marginTop: 8, textAlign: 'center' }}>
          <Capsule spinning />
          <p style={{ fontSize: 14, margin: '14px 0 0' }}>{uiText(locale, 'gachaDrawing')}</p>
        </div>
      )}

      {phase === 'result' && result && won && (
        <div
          style={{
            marginTop: 8,
            borderRadius: 16,
            border: '1px solid #E9D6AE',
            background: 'linear-gradient(180deg, #FFFBF0, #FBF3E2)',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
            padding: 16,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: '#8A6A3C', margin: 0 }}>
            {uiText(locale, 'gachaDrawnLabel')}
          </p>
          <p
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: ACCENT,
              margin: '4px 0 0',
              lineHeight: 1.15,
            }}
          >
            {uiText(locale, 'gachaRankLabel', { rank: String(result.rank) })}
          </p>
          <p style={{ fontSize: 17, fontWeight: 800, color: INK, margin: '4px 0 0' }}>
            {result.prizeName}
          </p>
          {result.redeemed ? (
            <p
              style={{
                display: 'inline-block',
                marginTop: 16,
                fontSize: 14,
                fontWeight: 800,
                color: '#64748b',
                border: '1.5px solid #cbd5e1',
                borderRadius: 999,
                padding: '6px 18px',
              }}
            >
              {uiText(locale, 'gachaRedeemedLabel')}
            </p>
          ) : (
            <>
              <div
                style={{
                  marginTop: 16,
                  display: 'flex',
                  justifyContent: 'center',
                  backgroundColor: '#ffffff',
                  border: '1px solid #E9D6AE',
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <QRCodeSVG value={result.code ?? ''} size={176} />
              </div>
              <p style={{ fontSize: 13.5, margin: '12px 0 0', lineHeight: 1.6 }}>
                {uiText(locale, 'gachaWinNote')}
              </p>
              <p
                style={{
                  fontSize: 11.5,
                  color: '#64748b',
                  margin: '8px 0 0',
                  wordBreak: 'break-all',
                }}
              >
                {result.code}
              </p>
            </>
          )}
        </div>
      )}

      {phase === 'result' && result && !won && (
        <div style={{ ...cardStyle, marginTop: 8, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <SheepCharacter mood="daikyo" size={110} />
          </div>
          <p style={{ fontSize: 18, fontWeight: 900, color: INK, margin: '8px 0 0' }}>
            {uiText(locale, 'gachaMissTitle')}
          </p>
          <p style={{ fontSize: 14, margin: '6px 0 0' }}>{uiText(locale, 'gachaMissNote')}</p>
        </div>
      )}
    </section>
  );
}

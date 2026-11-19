// lib/event-member-auth.ts
// 参拝者本人の API が、ID トークンから memberId を導く共通処理。
//
// 初詣は端末認証のみ（SMS電話認証は無い）。参拝者は匿名認証で
// サインインし、その uid（端末に保持される識別子）のハッシュが
// memberId になる。電話番号は一切集めない。
import { NextResponse } from 'next/server';
import { authAdmin } from './firebase-admin';
import { memberIdForDevice } from './event-coupon';

/** ID トークンのクレームのうち本人キー導出に使う部分。 */
export interface MemberTokenClaims {
  uid?: unknown;
}

/**
 * トークンのクレームから memberId を導く（純粋関数）。
 * 端末の識別子（uid）がクレームに無ければ null（= 認証エラー扱い）。
 */
export function resolveMemberIdFromClaims(
  claims: MemberTokenClaims,
): string | null {
  return typeof claims.uid === 'string' && claims.uid
    ? memberIdForDevice(claims.uid)
    : null;
}

/**
 * リクエストの ID トークンから memberId を引く。引けなければ
 * エラーレスポンスを返す（各 member 系 API の従来の作法と同じ形）。
 */
export async function memberIdFromRequest(
  request: Request,
): Promise<{ memberId: string } | { error: NextResponse }> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      error: NextResponse.json({ error: '認証が必要です' }, { status: 401 }),
    };
  }
  try {
    const decoded = await authAdmin.verifyIdToken(authHeader.slice(7));
    const memberId = resolveMemberIdFromClaims(decoded);
    if (!memberId) {
      return {
        error: NextResponse.json({ error: '認証が必要です' }, { status: 401 }),
      };
    }
    return { memberId };
  } catch {
    return {
      error: NextResponse.json(
        { error: '認証の有効期限が切れています' },
        { status: 401 },
      ),
    };
  }
}

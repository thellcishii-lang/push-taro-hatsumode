// lib/event-gacha.ts
// 初詣ガチャの抽選記録と消込（Firestore 側）。
//
// 置き場所の設計（おみくじ = lib/event-omikuji.ts と同じ考え方）:
// - 抽選記録は events/{eventId} 配下ではなく、トップレベルの gachaDraws に置く。
//   日次リセットは events 配下のサブコレクションしか消さないため、
//   抽選記録はリセットに巻き込まれず「シーズンを通して1人1回」が保たれる。
// - 消えるのはシーズン終了時の終了処理だけ（lib/event-reset.ts の終了処理が
//   eventId 一致分を全消去する。当選本数のカウンタ gachaPrizeCounts も同様）。
// - ドキュメントIDは `${eventId}_${memberId}` で決定論的にし、
//   トランザクションで「無ければ引く・あればそれを返す」を保証する。
// - 当選本数の上限（stock）の判定は、等位ごとの当選数を数えるカウンタ
//   （gachaPrizeCounts/{eventId}）を同じトランザクションで読み書きして
//   競合に強くする（同時に引いても上限を超えて当選させない）。
//
// 当選時の景品交換コードは、クーポン取得記録の消込コード（claimId）と
// 同じ「QR に載せて消込画面で読み取る文字列」で、`gacha_` 接頭辞で
// 区別する。消込は既存の消込ルート（app/api/events/[eventId]/redeem）が
// 接頭辞を見てこちらへ振り分ける。ガチャ景品は出店者クーポンではない
// ため、クーポン上限（couponCap）は消費しない。
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { EVENT_SUBCOLLECTIONS, type GachaPrize } from './event';
import { getEvent } from './event-store';
import type { RedeemResult, RedemptionActor } from './event-coupon';

/** 抽選記録のコレクション名（トップレベル）。 */
export const GACHA_DRAWS_COLLECTION = 'gachaDraws';

/** 等位ごとの当選数カウンタのコレクション名（トップレベル、ドキュメントID = eventId）。 */
export const GACHA_PRIZE_COUNTS_COLLECTION = 'gachaPrizeCounts';

/** 景品交換コードの接頭辞（クーポンの claimId と区別するための目印）。 */
export const GACHA_CODE_PREFIX = 'gacha_';

/** 抽選記録のドキュメントID（決定論的）。 */
export function gachaDrawDocId(eventId: string, memberId: string): string {
  return `${eventId}_${memberId}`;
}

/** 当選時の景品交換コード（QR の中身・消込コード）。 */
export function gachaRedemptionCode(eventId: string, memberId: string): string {
  return `${GACHA_CODE_PREFIX}${eventId}_${memberId}`;
}

/** 提示されたコードがガチャの景品交換コードかどうか。 */
export function isGachaRedemptionCode(code: string): boolean {
  return code.startsWith(GACHA_CODE_PREFIX);
}

export interface GachaDrawRecord {
  eventId: string;
  memberId: string;
  /** 当選した等位。ハズレは null */
  rank: number | null;
  /** 当選した景品名（抽選時点の名前を保持）。ハズレは null */
  prizeName: string | null;
  /** 景品交換コード。ハズレは null */
  code: string | null;
  /** 景品交換（消込）済みかどうか */
  redeemed: boolean;
  /** 抽選日時（ISO文字列）。保存直後で読めない場合は null */
  drawnAt: string | null;
}

function timestampToIso(value: unknown): string | null {
  return value && typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate().toISOString()
    : null;
}

function toDrawRecord(
  eventId: string,
  memberId: string,
  data: FirebaseFirestore.DocumentData | undefined,
): GachaDrawRecord | null {
  if (!data) return null;
  const rank =
    typeof data.rank === 'number' && Number.isInteger(data.rank)
      ? data.rank
      : null;
  return {
    eventId,
    memberId,
    rank,
    prizeName: typeof data.prizeName === 'string' ? data.prizeName : null,
    code: typeof data.code === 'string' ? data.code : null,
    redeemed: Boolean(data.redeemedAt),
    drawnAt: timestampToIso(data.drawnAt),
  };
}

/** 既存の抽選記録を読む。無ければ null。 */
export async function getGachaDraw(
  eventId: string,
  memberId: string,
): Promise<GachaDrawRecord | null> {
  const snap = await db
    .collection(GACHA_DRAWS_COLLECTION)
    .doc(gachaDrawDocId(eventId, memberId))
    .get();
  if (!snap.exists) return null;
  return toDrawRecord(eventId, memberId, snap.data());
}

/**
 * ガチャの抽選（純粋関数・テスト対象）。
 * - 抽選対象は「景品名があり確率が 0 より大きい」等位だけ。
 * - roll は 0〜100 の一様乱数。等位の確率帯は設定どおりに並べ、
 *   roll が合計確率を超えたらハズレ。
 * - 在庫切れ（stock 到達）の等位の確率帯に当たった場合もハズレにし、
 *   確率を他の等位へ再配分しない（主催者の設定どおりの確率を守る）。
 */
export function pickGachaPrize(
  prizes: GachaPrize[],
  exhaustedRanks: ReadonlySet<number>,
  random: () => number = Math.random,
): GachaPrize | null {
  const roll = random() * 100;
  let cumulative = 0;
  const ordered = [...prizes].sort((a, b) => a.rank - b.rank);
  for (const prize of ordered) {
    if (!prize.name || prize.probability <= 0) continue;
    cumulative += prize.probability;
    if (roll < cumulative) {
      return exhaustedRanks.has(prize.rank) ? null : prize;
    }
  }
  return null;
}

/** カウンタドキュメントから等位ごとの当選数を Map で読む（防御的）。 */
export function parseGachaWinCounts(
  data: FirebaseFirestore.DocumentData | undefined,
): Map<number, number> {
  const counts = new Map<number, number>();
  const raw = data?.counts;
  if (!raw || typeof raw !== 'object') return counts;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const rank = Number(key);
    if (Number.isInteger(rank) && typeof value === 'number' && value >= 0) {
      counts.set(rank, value);
    }
  }
  return counts;
}

/** 在庫切れ（当選本数の上限到達）の等位集合を求める（純粋関数）。 */
export function exhaustedGachaRanks(
  prizes: GachaPrize[],
  winCounts: ReadonlyMap<number, number>,
): Set<number> {
  const exhausted = new Set<number>();
  for (const prize of prizes) {
    if (prize.stock !== null && (winCounts.get(prize.rank) ?? 0) >= prize.stock) {
      exhausted.add(prize.rank);
    }
  }
  return exhausted;
}

export type DrawGachaResult =
  | {
      ok: true;
      rank: number | null;
      prizeName: string | null;
      code: string | null;
      redeemed: boolean;
      /** 既に引いていた場合は true（再抽選はしていない）。 */
      alreadyDrawn: boolean;
      drawnAt: string | null;
    }
  | { ok: false; status: number; error: string };

/**
 * ガチャを回す（1端末1回・冪等）。
 * - イベントが無ければ 404、ガチャがオフなら 403、未登録の端末は 403
 *   （おみくじと同じ作法）。
 * - 抽選と当選数の加算は1つのトランザクションで行い、同時抽選でも
 *   当選本数の上限を超えない。既存記録があればそれをそのまま返す。
 */
export async function drawGacha(
  eventId: string,
  memberId: string,
  random: () => number = Math.random,
): Promise<DrawGachaResult> {
  const event = await getEvent(eventId);
  if (!event) return { ok: false, status: 404, error: 'イベントが見つかりません' };
  if (!event.gachaEnabled) {
    return { ok: false, status: 403, error: 'このイベントではガチャを実施していません' };
  }

  const memberSnap = await db
    .collection('events')
    .doc(eventId)
    .collection(EVENT_SUBCOLLECTIONS.members)
    .doc(memberId)
    .get();
  if (!memberSnap.exists) {
    return { ok: false, status: 403, error: '先にイベントへ登録してください' };
  }

  const drawRef = db
    .collection(GACHA_DRAWS_COLLECTION)
    .doc(gachaDrawDocId(eventId, memberId));
  const countsRef = db.collection(GACHA_PRIZE_COUNTS_COLLECTION).doc(eventId);

  const outcome = await db.runTransaction(async (tx) => {
    const existing = await tx.get(drawRef);
    if (existing.exists) {
      const record = toDrawRecord(eventId, memberId, existing.data());
      if (record) {
        return {
          rank: record.rank,
          prizeName: record.prizeName,
          code: record.code,
          redeemed: record.redeemed,
          alreadyDrawn: true,
        };
      }
    }
    const countsSnap = await tx.get(countsRef);
    const winCounts = parseGachaWinCounts(countsSnap.data());
    const picked = pickGachaPrize(
      event.gachaPrizes,
      exhaustedGachaRanks(event.gachaPrizes, winCounts),
      random,
    );
    const code = picked ? gachaRedemptionCode(eventId, memberId) : null;
    tx.set(drawRef, {
      eventId,
      memberId,
      rank: picked?.rank ?? null,
      prizeName: picked?.name ?? null,
      code,
      redeemedAt: null,
      drawnAt: FieldValue.serverTimestamp(),
    });
    if (picked) {
      winCounts.set(picked.rank, (winCounts.get(picked.rank) ?? 0) + 1);
      const counts: Record<string, number> = {};
      for (const [rank, count] of winCounts) counts[String(rank)] = count;
      tx.set(countsRef, { eventId, counts }, { merge: true });
    }
    return {
      rank: picked?.rank ?? null,
      prizeName: picked?.name ?? null,
      code,
      redeemed: false,
      alreadyDrawn: false,
    };
  });

  // 確定した抽選日時を読み直す（サーバータイムスタンプの解決後）。
  const saved = await getGachaDraw(eventId, memberId);
  return {
    ok: true,
    rank: outcome.rank,
    prizeName: outcome.prizeName,
    code: outcome.code,
    redeemed: outcome.redeemed,
    alreadyDrawn: outcome.alreadyDrawn,
    drawnAt: saved?.drawnAt ?? null,
  };
}

/**
 * ガチャ景品の消込（景品交換）。
 * ガチャ景品は主催者（神社・寺院側）の発行物で出店者に属さないため、
 * そのイベントの主催者・出店者のどちらでも消込できる
 * （会場で景品を渡す担当が消し込む想定）。二重交換はできない。
 * 戻り値の形はクーポン消込（redeemClaim）と揃え、消込ルートから
 * そのまま返せるようにする。
 */
export async function redeemGachaCode(
  eventId: string,
  code: string,
  actor: RedemptionActor,
): Promise<RedeemResult> {
  const prefix = `${GACHA_CODE_PREFIX}${eventId}_`;
  if (!code.startsWith(prefix) || code.length <= prefix.length) {
    return { ok: false, status: 404, error: '取得記録が見つかりません' };
  }
  const memberId = code.slice(prefix.length);
  const drawRef = db
    .collection(GACHA_DRAWS_COLLECTION)
    .doc(gachaDrawDocId(eventId, memberId));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(drawRef);
    const record = snap.exists
      ? toDrawRecord(eventId, memberId, snap.data())
      : null;
    // コードが一致しない・ハズレ（景品なし）の記録は「見つからない」扱い
    if (!record || record.code !== code || record.rank === null) {
      return {
        ok: false,
        status: 404,
        error: '取得記録が見つかりません',
      } as RedeemResult;
    }
    if (record.redeemed) {
      return {
        ok: false,
        status: 409,
        error: 'このクーポンは消込済みです',
      } as RedeemResult;
    }
    tx.update(drawRef, {
      redeemedAt: FieldValue.serverTimestamp(),
      redeemedBy: actor.type === 'organizer' ? 'organizer' : actor.exhibitorId,
    });
    return { ok: true, claimId: code } as RedeemResult;
  });
}

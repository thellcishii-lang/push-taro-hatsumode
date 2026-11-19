// lib/event-omikuji.ts
// 初詣おみくじの抽選記録（Firestore 側）。
//
// 置き場所の設計:
// - 記録は events/{eventId} 配下ではなく、トップレベルの omikujiDraws に置く。
//   日次リセットは events 配下のサブコレクションしか消さないため、
//   抽選記録はリセットに巻き込まれず「シーズンを通して1人1回」が保たれる。
// - 消えるのはシーズン終了時の終了処理（1月31日24時）だけ
//   （lib/event-reset.ts の終了処理が eventId 一致分を全消去する）。
// - ドキュメントIDは `${eventId}_${memberId}` で決定論的にし、
//   トランザクションで「無ければ引く・あればそれを返す」を保証する
//   （同時リクエストでも二重に引けない）。
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { EVENT_SUBCOLLECTIONS } from './event';
import { getEvent } from './event-store';
import {
  drawOmikujiGrade,
  isOmikujiGrade,
  type OmikujiGrade,
} from './omikuji-content';

/** 抽選記録のコレクション名（トップレベル）。 */
export const OMIKUJI_DRAWS_COLLECTION = 'omikujiDraws';

/** 抽選記録のドキュメントID（決定論的）。 */
export function omikujiDrawDocId(eventId: string, memberId: string): string {
  return `${eventId}_${memberId}`;
}

export interface OmikujiDrawRecord {
  eventId: string;
  memberId: string;
  grade: OmikujiGrade;
  /** 抽選日時（ISO文字列）。保存直後で読めない場合は null。 */
  drawnAt: string | null;
}

function toDrawRecord(
  eventId: string,
  memberId: string,
  data: FirebaseFirestore.DocumentData | undefined,
): OmikujiDrawRecord | null {
  if (!data || !isOmikujiGrade(data.grade)) return null;
  const drawnAtRaw = data.drawnAt;
  return {
    eventId,
    memberId,
    grade: data.grade,
    drawnAt:
      drawnAtRaw && typeof drawnAtRaw.toDate === 'function'
        ? drawnAtRaw.toDate().toISOString()
        : null,
  };
}

/** 既存の抽選記録を読む。無ければ null。 */
export async function getOmikujiDraw(
  eventId: string,
  memberId: string,
): Promise<OmikujiDrawRecord | null> {
  const snap = await db
    .collection(OMIKUJI_DRAWS_COLLECTION)
    .doc(omikujiDrawDocId(eventId, memberId))
    .get();
  if (!snap.exists) return null;
  return toDrawRecord(eventId, memberId, snap.data());
}

export type DrawOmikujiResult =
  | {
      ok: true;
      grade: OmikujiGrade;
      /** 既に引いていた場合は true（再抽選はしていない）。 */
      alreadyDrawn: boolean;
      drawnAt: string | null;
    }
  | { ok: false; status: number; error: string };

/**
 * おみくじを引く（1端末1回・冪等）。
 * - イベントが無ければ 404、未登録の端末は 403（クーポン取得と同じ作法）。
 * - 抽選はトランザクション内で行い、既存記録があればそれをそのまま返す。
 */
export async function drawOmikuji(
  eventId: string,
  memberId: string,
): Promise<DrawOmikujiResult> {
  const event = await getEvent(eventId);
  if (!event) return { ok: false, status: 404, error: 'イベントが見つかりません' };

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
    .collection(OMIKUJI_DRAWS_COLLECTION)
    .doc(omikujiDrawDocId(eventId, memberId));

  // トランザクションの実行関数は再試行で複数回呼ばれうる。
  // runTransaction は「コミットされた回」の戻り値を返すため、
  // それがそのまま確定した結果になる。
  const outcome = await db.runTransaction(async (tx) => {
    const existing = await tx.get(drawRef);
    if (existing.exists) {
      const record = toDrawRecord(eventId, memberId, existing.data());
      if (record) {
        return { grade: record.grade, alreadyDrawn: true };
      }
    }
    const grade = drawOmikujiGrade();
    tx.set(drawRef, {
      eventId,
      memberId,
      grade,
      drawnAt: FieldValue.serverTimestamp(),
    });
    return { grade, alreadyDrawn: false };
  });

  // 確定した抽選日時を読み直す（サーバータイムスタンプの解決後）。
  const saved = await getOmikujiDraw(eventId, memberId);
  return {
    ok: true,
    grade: outcome.grade,
    alreadyDrawn: outcome.alreadyDrawn,
    drawnAt: saved?.drawnAt ?? null,
  };
}

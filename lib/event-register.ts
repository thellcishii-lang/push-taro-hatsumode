// lib/event-register.ts
// Push-taro 初詣 の参拝者登録（events/{eventId} 配下への配置）。
//
// - 本人確認は端末認証のみ（SMS電話認証は無い）。匿名認証の uid
//   （端末に保持される識別子）がその人の識別キーになり、電話番号は
//   一切集めない。登録は「タップで登録」。
// - members/{memberId}: 本人確認レコード。memberId は端末 uid の
//   SHA-256 ハッシュ（'device:' 接頭辞付き）で、uid そのものを
//   ドキュメントIDにしない。方式B（keep-phones）では日次リセットでも
//   残り、イベント終了時に消去される。
// - subscribers/{memberId}: プッシュ購読（FCMトークン）。1端末につき
//   1購読とし、再登録はトークンの更新として扱う。日次リセットで
//   消去される。
// - 登録者数の上限では登録を止めない（初詣の決定: 上限なし）。
//   契約枠（subscriberCap）は料金段階のデータとして保持するだけで、
//   登録可否には使わない。
import { FieldValue } from 'firebase-admin/firestore';
import { db, messaging } from './firebase-admin';
import { EVENT_SUBCOLLECTIONS, EventConfig, jstDateString, localeTopic } from './event';
import { isLocale, normalizeLocale, type Locale } from './i18n';
import { getEvent } from './event-store';
import { memberIdForDevice } from './event-coupon';

export type RegistrationRejection =
  | 'not-live'
  | 'before-period'
  | 'after-period';

export type RegistrationDecision =
  | { allowed: true }
  | { allowed: false; reason: RegistrationRejection };

/**
 * 登録可否の判定（純粋関数）。
 * 状態が live で、開催期間内（JST の今日が startDate〜endDate）のときだけ
 * 登録できる。登録者数の上限では止めない（初詣は上限なし）。
 * 手動終了を受け付けたイベントは、期間内でも新規登録を受け付けない。
 */
export function evaluateRegistration(
  event: Pick<EventConfig, 'status' | 'startDate' | 'endDate' | 'manualEndAt'>,
  today: string,
): RegistrationDecision {
  if (event.status !== 'live') return { allowed: false, reason: 'not-live' };
  if (event.manualEndAt) return { allowed: false, reason: 'after-period' };
  if (today < event.startDate) return { allowed: false, reason: 'before-period' };
  if (today > event.endDate) return { allowed: false, reason: 'after-period' };
  return { allowed: true };
}

const REJECTION_RESPONSES: Record<
  RegistrationRejection,
  { status: number; error: string }
> = {
  'not-live': { status: 403, error: 'このイベントは現在登録を受け付けていません' },
  'before-period': { status: 403, error: 'このイベントはまだ開催前です' },
  'after-period': { status: 403, error: 'このイベントは終了しました' },
};

export type RegisterVisitorResult =
  | { ok: true; memberId: string }
  | { ok: false; status: number; error: string };

function eventRef(eventId: string) {
  return db.collection('events').doc(eventId);
}

/**
 * 端末認証の参拝者登録。本人キーは匿名認証の uid（端末に保持される
 * 識別子）で、members レコードに電話番号は持たない。
 */
export async function registerEventVisitor(
  eventId: string,
  input: { deviceUid: string; fcmToken: string; lang?: string; now?: Date },
): Promise<RegisterVisitorResult> {
  const event = await getEvent(eventId);
  if (!event) {
    return { ok: false, status: 404, error: 'イベントが見つかりません' };
  }

  const now = input.now ?? new Date();
  const today = jstDateString(now);
  const memberId = memberIdForDevice(input.deviceUid);
  const subscribersRef = eventRef(eventId).collection(EVENT_SUBCOLLECTIONS.subscribers);
  const membersRef = eventRef(eventId).collection(EVENT_SUBCOLLECTIONS.members);
  const subscriberRef = subscribersRef.doc(memberId);
  const memberRef = membersRef.doc(memberId);

  const [subscriberSnap, memberSnap] = await Promise.all([
    subscriberRef.get(),
    memberRef.get(),
  ]);
  const alreadyRegistered = subscriberSnap.exists;

  const decision = evaluateRegistration(event, today);
  if (!decision.allowed) {
    const response = REJECTION_RESPONSES[decision.reason];
    return { ok: false, status: response.status, error: response.error };
  }

  const batch = db.batch();
  if (!memberSnap.exists) {
    batch.set(memberRef, {
      authMethod: 'device',
      deviceUid: input.deviceUid,
      createdAt: FieldValue.serverTimestamp(),
      lastRegisteredAt: FieldValue.serverTimestamp(),
    });
  } else {
    batch.update(memberRef, { lastRegisteredAt: FieldValue.serverTimestamp() });
  }
  // 言語は個人の選択を優先し、無ければイベントのデフォルト言語で登録する
  const lang = normalizeLocale(input.lang, event.defaultLocale);
  const previousLang = alreadyRegistered
    ? normalizeLocale(subscriberSnap.data()?.lang, event.defaultLocale)
    : null;
  batch.set(subscriberRef, {
    memberId,
    fcmToken: input.fcmToken,
    lang,
    registeredDate: today,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  // 配信は言語別 FCM トピック宛て。失敗しても登録自体は成立させる。
  // 言語が変わった再登録では、旧言語のトピックから外して付け替える。
  try {
    if (previousLang && previousLang !== lang) {
      await messaging.unsubscribeFromTopic(
        [input.fcmToken],
        localeTopic(eventId, previousLang),
      );
    }
    await messaging.subscribeToTopic([input.fcmToken], localeTopic(eventId, lang));
  } catch (error) {
    console.warn('[EVENT] FCMトピック登録をスキップ:', error);
  }

  return { ok: true, memberId };
}

export type UpdateLanguageResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * 登録済み購読者の言語を変更する（参拝者画面の言語切替から呼ぶ）。
 * 購読者レコードの lang と、言語別 FCM トピックの付け替えを一緒に行う。
 */
export async function updateSubscriberLanguage(
  eventId: string,
  memberId: string,
  lang: Locale,
): Promise<UpdateLanguageResult> {
  const event = await getEvent(eventId);
  if (!event) {
    return { ok: false, status: 404, error: 'イベントが見つかりません' };
  }
  const ref = eventRef(eventId)
    .collection(EVENT_SUBCOLLECTIONS.subscribers)
    .doc(memberId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, status: 404, error: '登録が見つかりません' };
  }
  const data = snap.data() ?? {};
  const previous = normalizeLocale(data.lang, event.defaultLocale);
  if (previous === lang) return { ok: true };

  await ref.update({ lang, updatedAt: FieldValue.serverTimestamp() });

  const token = typeof data.fcmToken === 'string' ? data.fcmToken : '';
  if (token) {
    try {
      await messaging.unsubscribeFromTopic([token], localeTopic(eventId, previous));
      await messaging.subscribeToTopic([token], localeTopic(eventId, lang));
    } catch (error) {
      console.warn('[EVENT] 言語変更時のトピック付け替えをスキップ:', error);
    }
  }
  return { ok: true };
}

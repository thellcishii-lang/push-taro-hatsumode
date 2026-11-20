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
import { isLocale, normalizeLocale, SUPPORTED_LOCALES, type Locale } from './i18n';
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
 * 言語別 FCM トピックの所属を「その言語のトピックだけ」に揃え直す。
 *
 * 配信は全言語のトピックへ送られ、未翻訳の言語には日本語の文面が
 * そのまま届く。そのため1つのトークンが2つの言語トピックに残ると、
 * 同じ通知が二重に届く。解除はベストエフォートで、失敗した解除や
 * トークンの差し替えがあると所属がずれていくので、登録・言語変更の
 * たびにここで揃え直して自己修復する。
 *
 * - previousToken があり現在のトークンと異なる場合、旧トークンは
 *   全言語のトピックから外す（差し替え前のトークンへ送り続けない）。
 * - 現在のトークンは、自分の言語以外のトピックから外してから、
 *   自分の言語のトピックへ登録する。
 * - 個々の解除・登録の失敗は握りつぶし（警告ログのみ）、呼び出し元の
 *   登録・言語変更自体は必ず成功させる。
 */
async function syncLocaleTopicMembership(
  eventId: string,
  token: string,
  lang: Locale,
  previousToken?: string,
): Promise<void> {
  if (previousToken && previousToken !== token) {
    for (const locale of SUPPORTED_LOCALES) {
      try {
        await messaging.unsubscribeFromTopic(
          [previousToken],
          localeTopic(eventId, locale),
        );
      } catch (error) {
        console.warn('[EVENT] 旧トークンのトピック解除をスキップ:', error);
      }
    }
  }
  for (const locale of SUPPORTED_LOCALES) {
    if (locale === lang) continue;
    try {
      await messaging.unsubscribeFromTopic([token], localeTopic(eventId, locale));
    } catch (error) {
      console.warn('[EVENT] トピック解除をスキップ:', error);
    }
  }
  try {
    await messaging.subscribeToTopic([token], localeTopic(eventId, lang));
  } catch (error) {
    console.warn('[EVENT] FCMトピック登録をスキップ:', error);
  }
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
  // 上書きする前に、前回のトークンを控える（トークンが差し替わっていたら
  // 旧トークンのトピック所属も解除するため）。
  const previousData = alreadyRegistered ? subscriberSnap.data() : undefined;
  const previousToken =
    typeof previousData?.fcmToken === 'string' ? previousData.fcmToken : undefined;
  batch.set(subscriberRef, {
    memberId,
    fcmToken: input.fcmToken,
    lang,
    registeredDate: today,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  // 配信は言語別 FCM トピック宛て。所属を毎回揃え直す（失敗しても
  // 登録自体は成立させる）。
  await syncLocaleTopicMembership(eventId, input.fcmToken, lang, previousToken);

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
    // 旧言語だけでなく、自分の言語以外の全トピックから外して揃え直す
    // （過去に解除が失敗して残っていても、ここで修復される）。
    await syncLocaleTopicMembership(eventId, token, lang);
  }
  return { ok: true };
}

export type RegistrationStatusResult =
  | { ok: true; registered: boolean }
  | { ok: false; status: number; error: string };

/**
 * 本人の購読者レコードが「いまの登録分」として残っているかを返す。
 *
 * 判定はレコードの有無そのもの（お知らせ API と同じ基準）。日次リセットは
 * 購読者コレクションを丸ごと消去するため、残っているレコードは前回の
 * リセット以降に登録された分だけになる。registeredDate と今日の比較では
 * いけない: 年越しの前倒しリセット（12月31日 21:00 実行・対象日は翌1月1日）
 * をまたいだ登録は、registeredDate が 12月31日のまま元日の購読者として
 * 保持される（resetDateKeyFor が 1月1日分を済みとして扱うため）。
 */
export async function getVisitorRegistrationStatus(
  eventId: string,
  memberId: string,
): Promise<RegistrationStatusResult> {
  const event = await getEvent(eventId);
  if (!event) {
    return { ok: false, status: 404, error: 'イベントが見つかりません' };
  }
  const snap = await eventRef(eventId)
    .collection(EVENT_SUBCOLLECTIONS.subscribers)
    .doc(memberId)
    .get();
  return { ok: true, registered: snap.exists };
}

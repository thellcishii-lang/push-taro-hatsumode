// lib/variant-identity.ts
// このバリアント（初詣）自身の識別子の単一の出どころ。
//
// 背景: このリポジトリは EVENT（push-taro-event）からのフォークで、
// 公開 URL の定数に EVENT 側の origin が残っていたため、主催者コンソールの
// QR・リンクが EVENT アプリを指してしまう事故があった（2026-11-20）。
// 識別子はここで一度だけ定義し、origin と Storage バケットはここから
// 導出する。他バリアントの識別子がコードに紛れ込んでいないかは
// lib/variant-identity.test.ts が検査する。

/** このバリアントの Firebase プロジェクト ID。 */
export const VARIANT_PROJECT_ID = 'push-taro-hatsumode';

/** App Hosting のバックエンド ID（このバリアントではプロジェクト ID と同じ）。 */
export const VARIANT_BACKEND_ID = 'push-taro-hatsumode';

/** 本番の App Hosting origin（導出値。直書きしない）。 */
export const VARIANT_APP_ORIGIN = `https://${VARIANT_BACKEND_ID}--${VARIANT_PROJECT_ID}.asia-east1.hosted.app`;

/** 既定の Storage バケット（導出値。直書きしない）。 */
export const VARIANT_DEFAULT_STORAGE_BUCKET = `${VARIANT_PROJECT_ID}.firebasestorage.app`;

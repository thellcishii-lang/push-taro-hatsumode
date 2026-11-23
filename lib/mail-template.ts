// lib/mail-template.ts
/**
 * お客さん向けメールの「型」（テンプレート）。
 *
 * 2026-11-23 Ishii 決定:
 * - 申込・決済などの自動メールを含む、お客さん向けに送るメール全てに
 *   枠・色の「型」を被せる。本文は従来どおりで、外側だけを整える。
 * - 型は製品ごとに分ける（帯カラー・シリーズ名・肩書き・フッター表記）。
 * - MOUNTAIN は後回しのため対象外（選択肢にも入れない）。
 * - システムエラーメール等の運営者向け内部通知には適用しない。
 *
 * 構造（見本: ~/workspace/product_ideas/customer_mail_template_mock.html）:
 *   製品カラーの帯ヘッダー（Push-taro＋赤ドット＋シリーズ名、肩書き）
 *   ／白地の本文エリア／署名フッター（製品名・info@push-taro.com）
 *
 * このモジュールはクライアントからも import できるよう、
 * サーバー専用の依存（nodemailer 等）を持たない純粋なモジュールにする
 * （admin のメール作成画面のプレビュー・製品セレクターで使う）。
 */

export type MailProduct =
  | 'push-taro'
  | 'event'
  | 'machiokoshi'
  | 'fes'
  | 'hatsumode'
  | 'stamprally';

export interface MailProductConfig {
  id: MailProduct;
  /** セレクター等での表示名 */
  label: string;
  /** 帯ヘッダーの背景色 */
  bandColor: string;
  /** 帯の上の肩書きテキストの色 */
  accentColor: string;
  /** ロゴのシリーズ名（本体は空文字） */
  seriesName: string;
  /** 帯の上の肩書き */
  tagline: string;
  /** フッター1行目（製品名・メールアドレス） */
  footerName: string;
  /** フッター2行目 */
  footerTagline: string;
}

export const MAIL_PRODUCTS: Record<MailProduct, MailProductConfig> = {
  'push-taro': {
    id: 'push-taro',
    label: 'Push-taro（本体）',
    bandColor: '#14213d',
    accentColor: '#fca311',
    seriesName: '',
    tagline: '店舗向けプッシュ通知',
    footerName: 'Push-taro.com（info@push-taro.com）',
    footerTagline: '店舗向けプッシュ通知×クーポンアプリ',
  },
  event: {
    id: 'event',
    label: 'Push-taro.EVENT',
    bandColor: '#4c1d95',
    accentColor: '#c4b5fd',
    seriesName: 'EVENT',
    tagline: '展示会・イベント',
    footerName: 'Push-taro EVENT（info@push-taro.com）',
    footerTagline: '展示会・イベント向けプッシュ通知×クーポンアプリ',
  },
  machiokoshi: {
    id: 'machiokoshi',
    label: 'Push-taro.町おこし',
    bandColor: '#5c4033',
    accentColor: '#e8c07a',
    seriesName: '町おこし',
    tagline: 'ご当地グルメで町おこし',
    footerName: 'Push-taro.町おこし（info@push-taro.com）',
    footerTagline: 'ご当地グルメで町おこしを仕組み化するアプリ',
  },
  fes: {
    id: 'fes',
    label: 'Push-taro FES',
    bandColor: '#0e7c86',
    accentColor: '#a5f3fc',
    seriesName: 'FES',
    tagline: 'フェス・コンサート',
    footerName: 'Push-taro FES（info@push-taro.com）',
    footerTagline: 'フェス・コンサート向けプッシュ通知アプリ',
  },
  hatsumode: {
    id: 'hatsumode',
    label: 'Push-taro 初詣',
    bandColor: '#d93a2b',
    accentColor: '#ffd9cf',
    seriesName: '初詣',
    tagline: '初詣の誘導と安全を届ける仕組み',
    footerName: 'Push-taro 初詣（info@push-taro.com）',
    footerTagline: '初詣の誘導と安全を、一人一人に届ける仕組み',
  },
  stamprally: {
    id: 'stamprally',
    label: 'Push-taro.スタンプラリー',
    bandColor: '#d93a2b',
    accentColor: '#ffd9cf',
    seriesName: 'スタンプラリー',
    tagline: 'スタンプラリーが簡単に仕込める',
    footerName: 'Push-taro.スタンプラリー（info@push-taro.com）',
    footerTagline: 'スタンプラリーが簡単に仕込めるアプリ',
  },
};

export const MAIL_PRODUCT_LIST: MailProductConfig[] = [
  MAIL_PRODUCTS['push-taro'],
  MAIL_PRODUCTS.event,
  MAIL_PRODUCTS.machiokoshi,
  MAIL_PRODUCTS.fes,
  MAIL_PRODUCTS.hatsumode,
  MAIL_PRODUCTS.stamprally,
];

export function isMailProduct(value: unknown): value is MailProduct {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(MAIL_PRODUCTS, value)
  );
}

/**
 * 本文 HTML に製品の「型」を被せる。
 * bodyHtml は従来どおりの本文（そのまま白地エリアに入る）。
 */
export function wrapMailTemplate(bodyHtml: string, product: MailProduct): string {
  const config = MAIL_PRODUCTS[product];
  const series = config.seriesName
    ? `<span style="font-size:13px;">${config.seriesName}</span>`
    : '';
  return `
<div style="background:#f4f1ec;padding:24px 12px;font-family:-apple-system,'Hiragino Kaku Gothic ProN','Hiragino Sans',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5ded2;border-radius:12px;overflow:hidden;">
    <div style="background:${config.bandColor};padding:16px 22px;">
      <span style="color:#ffffff;font-size:18px;font-weight:900;letter-spacing:-0.3px;">Push-taro<span style="color:#ff4500;">.</span>${series}</span>
      <span style="color:${config.accentColor};font-size:12px;font-weight:700;margin-left:8px;">${config.tagline}</span>
    </div>
    <div style="padding:22px;color:#33302b;font-size:14px;line-height:1.9;">
${bodyHtml}
    </div>
    <div style="border-top:1px solid #eee5d8;padding:14px 22px;font-size:11.5px;color:#8a8175;line-height:1.7;">
      ${config.footerName}<br />
      ${config.footerTagline}
    </div>
  </div>
</div>`;
}

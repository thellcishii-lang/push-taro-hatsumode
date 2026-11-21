// lib/event-billing.test.ts
// 出店者課金の純粋関数: 設定入力・金額・課金形態の検証、JST 月キーの
// 収支集計、Stripe Webhook イベントからローカルへの効果への変換、
// 終了時の自動解約の対象選定を検証する。
import { describe, expect, it } from 'vitest';
import {
  BILLING_PAYMENTS_CSV_HEADER,
  buildBillingPaymentsCsv,
  buildBillingSummaryCsv,
  summarizeBillingPayments,
  currentAndPreviousMonthKeys,
  effectFromStripeEvent,
  finalizationCancelTargets,
  formatJstDateTime,
  isValidStripeSecretKey,
  isValidStripeWebhookSecret,
  monthKeyJst,
  parseBillingAmount,
  parseBillingSettingsInput,
  parseBillingType,
  shopBillingTransitionForSubscriptionStatus,
  summarizePaymentsByMonth,
  type BillingPaymentRecord,
  type ShopBilling,
  type StripeWebhookEventLike,
} from './event-billing';

function stripeEvent(
  type: string,
  object: Record<string, unknown>,
  created = 1_762_000_000,
): StripeWebhookEventLike {
  return { id: `evt_${type}`, type, created, data: { object } };
}

describe('Stripe キーの形式チェック', () => {
  it('シークレットキーは sk_/rk_ の test/live を受け付ける', () => {
    expect(isValidStripeSecretKey('sk_live_abcdefghijklmnop')).toBe(true);
    expect(isValidStripeSecretKey('sk_test_abcdefghijklmnop')).toBe(true);
    expect(isValidStripeSecretKey('rk_live_abcdefghijklmnop')).toBe(true);
    expect(isValidStripeSecretKey('pk_live_abcdefghijklmnop')).toBe(false);
    expect(isValidStripeSecretKey('sk_live_short')).toBe(false);
    expect(isValidStripeSecretKey('')).toBe(false);
    expect(isValidStripeSecretKey(123)).toBe(false);
  });

  it('Webhook シークレットは whsec_ で始まるものだけ', () => {
    expect(isValidStripeWebhookSecret('whsec_abcdefghijklmnop')).toBe(true);
    expect(isValidStripeWebhookSecret('whsec_x')).toBe(false);
    expect(isValidStripeWebhookSecret('sk_live_abcdefghijklmnop')).toBe(false);
  });
});

describe('parseBillingSettingsInput', () => {
  it('片方だけの保存ができる（未指定は維持）', () => {
    const result = parseBillingSettingsInput({
      secretKey: 'sk_live_abcdefghijklmnop',
    });
    expect(result).toEqual({
      ok: true,
      value: { secretKey: 'sk_live_abcdefghijklmnop' },
    });
  });

  it('両方指定もでき、値は trim される', () => {
    const result = parseBillingSettingsInput({
      secretKey: '  sk_test_abcdefghijklmnop ',
      webhookSecret: 'whsec_abcdefghijklmnop',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.secretKey).toBe('sk_test_abcdefghijklmnop');
      expect(result.value.webhookSecret).toBe('whsec_abcdefghijklmnop');
    }
  });

  it('形式が不正なキーはエラー', () => {
    expect(parseBillingSettingsInput({ secretKey: 'abc' }).ok).toBe(false);
    expect(parseBillingSettingsInput({ webhookSecret: 'abc' }).ok).toBe(false);
  });

  it('何も無ければエラー、非オブジェクトもエラー', () => {
    expect(parseBillingSettingsInput({}).ok).toBe(false);
    expect(parseBillingSettingsInput(null).ok).toBe(false);
    expect(parseBillingSettingsInput('x').ok).toBe(false);
  });
});

describe('parseBillingAmount', () => {
  it('円の整数を受け付ける', () => {
    expect(parseBillingAmount(3000)).toEqual({ ok: true, value: 3000 });
    expect(parseBillingAmount(50)).toEqual({ ok: true, value: 50 });
  });

  it('範囲外・小数・文字列はエラー', () => {
    expect(parseBillingAmount(49).ok).toBe(false);
    expect(parseBillingAmount(10_000_001).ok).toBe(false);
    expect(parseBillingAmount(3000.5).ok).toBe(false);
    expect(parseBillingAmount('3000').ok).toBe(false);
    expect(parseBillingAmount(undefined).ok).toBe(false);
  });
});

describe('parseBillingType', () => {
  it('未指定は subscription（従来形）', () => {
    expect(parseBillingType(undefined)).toEqual({ ok: true, value: 'subscription' });
    expect(parseBillingType('subscription')).toEqual({ ok: true, value: 'subscription' });
  });

  it('one-time を受け付ける', () => {
    expect(parseBillingType('one-time')).toEqual({ ok: true, value: 'one-time' });
  });

  it('それ以外の値はエラー', () => {
    expect(parseBillingType('monthly').ok).toBe(false);
    expect(parseBillingType(null).ok).toBe(false);
    expect(parseBillingType(1).ok).toBe(false);
  });
});

describe('JST 月キーと収支集計', () => {
  it('monthKeyJst は JST で月を判定する（UTC 10月末は JST 11月）', () => {
    expect(monthKeyJst('2026-10-31T16:00:00.000Z')).toBe('2026-11');
    expect(monthKeyJst('2026-11-01T00:00:00.000Z')).toBe('2026-11');
    expect(monthKeyJst('garbage')).toBe('');
  });

  it('currentAndPreviousMonthKeys は年をまたいでも正しい', () => {
    expect(currentAndPreviousMonthKeys(new Date('2026-01-15T00:00:00.000Z'))).toEqual({
      current: '2026-01',
      previous: '2025-12',
    });
    // UTC では 2025-12-31 でも JST では 2026-01-01
    expect(currentAndPreviousMonthKeys(new Date('2025-12-31T16:00:00.000Z'))).toEqual({
      current: '2026-01',
      previous: '2025-12',
    });
  });

  it('summarizePaymentsByMonth は paid だけを今月・先月で合計する', () => {
    const now = new Date('2026-11-14T03:00:00.000Z'); // JST 2026-11-14
    const summary = summarizePaymentsByMonth(
      [
        { amount: 3000, status: 'paid', paidAt: '2026-11-02T01:00:00.000Z', occurredAt: '2026-11-02T01:00:00.000Z' },
        // UTC 10/31 16:00 = JST 11/1 → 今月
        { amount: 2000, status: 'paid', paidAt: '2026-10-31T16:00:00.000Z', occurredAt: '2026-10-31T16:00:00.000Z' },
        { amount: 4000, status: 'paid', paidAt: '2026-10-10T01:00:00.000Z', occurredAt: '2026-10-10T01:00:00.000Z' },
        // 失敗は数えない
        { amount: 9000, status: 'failed', paidAt: null, occurredAt: '2026-11-05T00:00:00.000Z' },
        // 先々月は数えない
        { amount: 7000, status: 'paid', paidAt: '2026-09-30T01:00:00.000Z', occurredAt: '2026-09-30T01:00:00.000Z' },
      ],
      now,
    );
    expect(summary).toEqual({
      currentMonthKey: '2026-11',
      currentMonthTotal: 5000,
      previousMonthKey: '2026-10',
      previousMonthTotal: 4000,
    });
  });
});

describe('shopBillingTransitionForSubscriptionStatus', () => {
  it('状態ごとの遷移と掲載への効果', () => {
    expect(shopBillingTransitionForSubscriptionStatus('active')).toEqual({
      status: 'active',
      suspend: false,
    });
    expect(shopBillingTransitionForSubscriptionStatus('past_due')).toEqual({
      status: 'past_due',
      suspend: null,
    });
    expect(shopBillingTransitionForSubscriptionStatus('unpaid')).toEqual({
      status: 'suspended',
      suspend: true,
    });
    expect(shopBillingTransitionForSubscriptionStatus('canceled')).toEqual({
      status: 'canceled',
      suspend: true,
    });
    expect(shopBillingTransitionForSubscriptionStatus('incomplete')).toEqual({
      status: 'none',
      suspend: null,
    });
    expect(shopBillingTransitionForSubscriptionStatus('unknown')).toBeNull();
  });
});

describe('effectFromStripeEvent', () => {
  it('checkout.session.completed（subscription）で ID を紐づける', () => {
    const effect = effectFromStripeEvent(
      stripeEvent('checkout.session.completed', {
        mode: 'subscription',
        subscription: 'sub_1',
        customer: 'cus_1',
        metadata: { eventId: 'event-1', exhibitorId: 'shop-1' },
      }),
    );
    expect(effect).toMatchObject({
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      paymentIntentId: null,
      metadataEventId: 'event-1',
      metadataExhibitorId: 'shop-1',
      billingPatch: { stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1' },
      suspend: null,
      payment: null,
      oneTimeOnly: false,
    });
  });

  it('checkout.session.completed（一括・支払い確定）で paid 化＋支払い記録＋復旧', () => {
    const effect = effectFromStripeEvent(
      stripeEvent('checkout.session.completed', {
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 8000,
        payment_intent: 'pi_1',
        customer: 'cus_1',
        metadata: { eventId: 'event-1', exhibitorId: 'shop-1' },
      }),
    );
    expect(effect).toMatchObject({
      subscriptionId: null,
      customerId: 'cus_1',
      paymentIntentId: 'pi_1',
      metadataEventId: 'event-1',
      metadataExhibitorId: 'shop-1',
      suspend: false,
      oneTimeOnly: false,
    });
    expect(effect?.billingPatch.status).toBe('paid');
    expect(effect?.billingPatch.stripePaymentIntentId).toBe('pi_1');
    expect(effect?.payment).toEqual({
      amount: 8000,
      status: 'paid',
      invoiceId: null,
      paidAt: new Date(1_762_000_000 * 1000).toISOString(),
    });
  });

  it('checkout.session.completed（一括・支払い未確定）は ID 紐づけだけで状態を動かさない', () => {
    const effect = effectFromStripeEvent(
      stripeEvent('checkout.session.completed', {
        mode: 'payment',
        payment_status: 'unpaid',
        amount_total: 8000,
        payment_intent: 'pi_2',
        customer: 'cus_1',
        metadata: { eventId: 'event-1', exhibitorId: 'shop-1' },
      }),
    );
    expect(effect?.billingPatch.status).toBeUndefined();
    expect(effect?.billingPatch.stripePaymentIntentId).toBe('pi_2');
    expect(effect?.suspend).toBeNull();
    expect(effect?.payment).toBeNull();
  });

  it('checkout.session.completed の対象外モード（setup）は null', () => {
    expect(
      effectFromStripeEvent(
        stripeEvent('checkout.session.completed', { mode: 'setup' }),
      ),
    ).toBeNull();
  });

  it('charge.refunded（全額返金）は一括払い限定の掲載停止', () => {
    const effect = effectFromStripeEvent(
      stripeEvent('charge.refunded', {
        id: 'ch_1',
        payment_intent: 'pi_1',
        customer: 'cus_1',
        refunded: true,
        amount: 8000,
        amount_refunded: 8000,
      }),
    );
    expect(effect).toMatchObject({
      paymentIntentId: 'pi_1',
      billingPatch: { status: 'suspended' },
      suspend: true,
      payment: null,
      oneTimeOnly: true,
    });
  });

  it('charge.refunded（部分返金）は対象外', () => {
    expect(
      effectFromStripeEvent(
        stripeEvent('charge.refunded', {
          id: 'ch_1',
          payment_intent: 'pi_1',
          refunded: false,
          amount: 8000,
          amount_refunded: 1000,
        }),
      ),
    ).toBeNull();
  });

  it('invoice.paid（旧形式）で active 化＋支払い記録＋復旧', () => {
    const effect = effectFromStripeEvent(
      stripeEvent('invoice.paid', {
        id: 'in_1',
        subscription: 'sub_1',
        customer: 'cus_1',
        amount_paid: 3000,
        status_transitions: { paid_at: 1_762_000_000 },
        lines: { data: [{ period: { end: 1_765_000_000 } }] },
      }),
    );
    expect(effect?.billingPatch.status).toBe('active');
    expect(effect?.billingPatch.currentPeriodEnd).toBe(
      new Date(1_765_000_000 * 1000).toISOString(),
    );
    expect(effect?.suspend).toBe(false);
    expect(effect?.payment).toEqual({
      amount: 3000,
      status: 'paid',
      invoiceId: 'in_1',
      paidAt: new Date(1_762_000_000 * 1000).toISOString(),
    });
    expect(effect?.subscriptionId).toBe('sub_1');
  });

  it('invoice.paid（現行形式: parent.subscription_details）でも引ける', () => {
    const effect = effectFromStripeEvent(
      stripeEvent('invoice.paid', {
        id: 'in_2',
        parent: {
          subscription_details: {
            subscription: 'sub_2',
            metadata: { eventId: 'event-9', exhibitorId: 'shop-9' },
          },
        },
        customer: 'cus_2',
        amount_paid: 5000,
      }),
    );
    expect(effect?.subscriptionId).toBe('sub_2');
    expect(effect?.metadataEventId).toBe('event-9');
    expect(effect?.metadataExhibitorId).toBe('shop-9');
    expect(effect?.payment?.amount).toBe(5000);
  });

  it('invoice.payment_failed は past_due にし、停止はまだしない', () => {
    const effect = effectFromStripeEvent(
      stripeEvent('invoice.payment_failed', {
        id: 'in_3',
        subscription: 'sub_1',
        customer: 'cus_1',
        amount_due: 3000,
      }),
    );
    expect(effect?.billingPatch.status).toBe('past_due');
    expect(effect?.suspend).toBeNull();
    expect(effect?.payment).toMatchObject({ amount: 3000, status: 'failed', invoiceId: 'in_3', paidAt: null });
  });

  it('customer.subscription.updated の unpaid で掲載停止', () => {
    const effect = effectFromStripeEvent(
      stripeEvent('customer.subscription.updated', {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'unpaid',
        metadata: { eventId: 'event-1', exhibitorId: 'shop-1' },
      }),
    );
    expect(effect?.billingPatch.status).toBe('suspended');
    expect(effect?.suspend).toBe(true);
  });

  it('customer.subscription.updated の past_due は停止しない', () => {
    const effect = effectFromStripeEvent(
      stripeEvent('customer.subscription.updated', {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'past_due',
      }),
    );
    expect(effect?.billingPatch.status).toBe('past_due');
    expect(effect?.suspend).toBeNull();
  });

  it('期間終了は items 形式（現行）からも読む', () => {
    const effect = effectFromStripeEvent(
      stripeEvent('customer.subscription.updated', {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        items: { data: [{ current_period_end: 1_765_000_000 }] },
      }),
    );
    expect(effect?.billingPatch.currentPeriodEnd).toBe(
      new Date(1_765_000_000 * 1000).toISOString(),
    );
    expect(effect?.suspend).toBe(false);
  });

  it('customer.subscription.deleted は canceled＋掲載停止', () => {
    const effect = effectFromStripeEvent(
      stripeEvent('customer.subscription.deleted', {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'canceled',
      }),
    );
    expect(effect?.billingPatch.status).toBe('canceled');
    expect(effect?.suspend).toBe(true);
  });

  it('対象外のイベント種別は null', () => {
    expect(
      effectFromStripeEvent(stripeEvent('payment_intent.succeeded', { id: 'pi_1' })),
    ).toBeNull();
    expect(
      effectFromStripeEvent(
        stripeEvent('customer.subscription.updated', {
          id: 'sub_1',
          status: 'something_new',
        }),
      ),
    ).toBeNull();
  });
});

describe('finalizationCancelTargets（終了時の自動解約の対象選定）', () => {
  const base: ShopBilling = {
    exhibitorId: 'shop-1',
    billingType: 'subscription',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    stripePaymentIntentId: null,
    amount: 3000,
    status: 'active',
    currentPeriodEnd: null,
    checkoutUrl: null,
    checkoutSessionId: null,
    canceledByAdmin: false,
    updatedAt: '',
  };

  it('月額サブスクで解約されていないものだけが対象', () => {
    const targets = finalizationCancelTargets([
      base,
      { ...base, exhibitorId: 'shop-2', status: 'past_due', stripeSubscriptionId: 'sub_2' },
      { ...base, exhibitorId: 'shop-3', status: 'suspended', stripeSubscriptionId: 'sub_3' },
    ]);
    expect(targets.map((t) => t.exhibitorId)).toEqual(['shop-1', 'shop-2', 'shop-3']);
  });

  it('一括払い・解約済み・サブスク未作成は対象外', () => {
    const targets = finalizationCancelTargets([
      { ...base, exhibitorId: 'one-time', billingType: 'one-time', status: 'paid', stripeSubscriptionId: null, stripePaymentIntentId: 'pi_1' },
      { ...base, exhibitorId: 'canceled', status: 'canceled' },
      { ...base, exhibitorId: 'not-started', status: 'none', stripeSubscriptionId: null },
    ]);
    expect(targets).toEqual([]);
  });
});

function paymentRecord(
  overrides: Partial<BillingPaymentRecord> = {},
): BillingPaymentRecord {
  return {
    id: 'evt_1',
    exhibitorId: 'shop-1',
    amount: 3000,
    status: 'paid',
    paidAt: '2026-11-02T00:00:00.000Z',
    occurredAt: '2026-11-02T00:00:00.000Z',
    stripeEventId: 'evt_1',
    stripeInvoiceId: 'in_123',
    ...overrides,
  };
}

function shopBilling(overrides: Partial<ShopBilling> = {}): ShopBilling {
  return {
    exhibitorId: 'shop-1',
    billingType: 'subscription',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    stripePaymentIntentId: null,
    amount: 3000,
    status: 'active',
    currentPeriodEnd: null,
    checkoutUrl: null,
    checkoutSessionId: 'cs_1',
    canceledByAdmin: false,
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildBillingPaymentsCsv', () => {
  const exhibitors = [
    { id: 'shop-1', name: '屋台A' },
    { id: 'shop-2', name: '屋台, "ほんわか"' },
  ];

  it('BOM 付きでヘッダーと行を出す（店名・種別・ID を結合）', () => {
    const csv = buildBillingPaymentsCsv(
      [paymentRecord()],
      exhibitors,
      [shopBilling()],
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines[0]).toBe(BILLING_PAYMENTS_CSV_HEADER.join(','));
    expect(lines[1]).toBe(
      '2026-11-02T09:00:00+09:00,屋台A,月額,3000,支払い済み,in_123,cs_1,sub_1',
    );
  });

  it('一括払いの課金レコードなら種別は「一括払い」', () => {
    const csv = buildBillingPaymentsCsv(
      [paymentRecord({ amount: 100, stripeInvoiceId: null })],
      exhibitors,
      [
        shopBilling({
          billingType: 'one-time',
          status: 'paid',
          stripeSubscriptionId: null,
          checkoutSessionId: 'cs_2',
        }),
      ],
    );
    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines[1]).toBe(
      '2026-11-02T09:00:00+09:00,屋台A,一括払い,100,支払い済み,,cs_2,',
    );
  });

  it('失敗記録は occurredAt を使い、状態は「失敗」', () => {
    const csv = buildBillingPaymentsCsv(
      [
        paymentRecord({
          status: 'failed',
          paidAt: null,
          occurredAt: '2026-11-03T12:00:00.000Z',
          stripeInvoiceId: null,
        }),
      ],
      exhibitors,
      [shopBilling()],
    );
    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines[1]).toBe(
      '2026-11-03T21:00:00+09:00,屋台A,月額,3000,失敗,,cs_1,sub_1',
    );
  });

  it('カンマ・引用符を含む店名は CSV エスケープする', () => {
    const csv = buildBillingPaymentsCsv(
      [paymentRecord({ exhibitorId: 'shop-2' })],
      exhibitors,
      [],
    );
    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines[1]).toContain('"屋台, ""ほんわか"""');
  });

  it('行は発生日時の昇順に並ぶ', () => {
    const csv = buildBillingPaymentsCsv(
      [
        paymentRecord({
          id: 'evt_2',
          occurredAt: '2026-11-05T00:00:00.000Z',
          paidAt: '2026-11-05T00:00:00.000Z',
        }),
        paymentRecord({
          id: 'evt_1',
          occurredAt: '2026-11-01T00:00:00.000Z',
          paidAt: '2026-11-01T00:00:00.000Z',
        }),
      ],
      exhibitors,
      [],
    );
    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines[1]).toContain('2026-11-01');
    expect(lines[2]).toContain('2026-11-05');
  });

  it('記録が無ければヘッダーのみ', () => {
    const csv = buildBillingPaymentsCsv([], exhibitors, []);
    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines).toEqual([BILLING_PAYMENTS_CSV_HEADER.join(',')]);
  });
});

describe('formatJstDateTime', () => {
  it('UTC を JST 表記に直す', () => {
    expect(formatJstDateTime('2026-01-01T00:00:00.000Z')).toBe(
      '2026-01-01T09:00:00+09:00',
    );
  });

  it('解釈できない文字列は空文字', () => {
    expect(formatJstDateTime('not-a-date')).toBe('');
  });
});

describe('summarizeBillingPayments', () => {
  const exhibitors = [
    { id: 'shop-1', name: 'カレー堂' },
    { id: 'shop-2', name: 'パン屋' },
  ];

  it('日次・月次・年次と総合計に集計する（JST基準）', () => {
    const summary = summarizeBillingPayments(
      [
        paymentRecord(), // 2026-11-02 09:00 JST, 3000 paid
        paymentRecord({
          id: 'evt_2',
          amount: 5000,
          paidAt: '2026-11-02T16:00:00.000Z', // 2026-11-03 01:00 JST
          occurredAt: '2026-11-02T16:00:00.000Z',
        }),
        paymentRecord({
          id: 'evt_3',
          status: 'failed',
          paidAt: null,
          occurredAt: '2026-12-01T00:00:00.000Z', // 2026-12-01 09:00 JST
        }),
      ],
      exhibitors,
    );
    expect(summary.daily).toEqual([
      { period: '2026-11-02', paidCount: 1, paidAmount: 3000, failedCount: 0 },
      { period: '2026-11-03', paidCount: 1, paidAmount: 5000, failedCount: 0 },
      { period: '2026-12-01', paidCount: 0, paidAmount: 0, failedCount: 1 },
    ]);
    expect(summary.monthly).toEqual([
      { period: '2026-11', paidCount: 2, paidAmount: 8000, failedCount: 0 },
      { period: '2026-12', paidCount: 0, paidAmount: 0, failedCount: 1 },
    ]);
    expect(summary.yearly).toEqual([
      { period: '2026', paidCount: 2, paidAmount: 8000, failedCount: 1 },
    ]);
    expect(summary.totalPaidCount).toBe(2);
    expect(summary.totalPaidAmount).toBe(8000);
    expect(summary.totalFailedCount).toBe(1);
  });

  it('出店者別月次は店名つきで集計する', () => {
    const summary = summarizeBillingPayments(
      [
        paymentRecord(),
        paymentRecord({ id: 'evt_2', exhibitorId: 'shop-2', amount: 2000 }),
      ],
      exhibitors,
    );
    expect(summary.shopMonthly).toEqual([
      {
        month: '2026-11',
        exhibitorId: 'shop-1',
        shopName: 'カレー堂',
        paidCount: 1,
        paidAmount: 3000,
        failedCount: 0,
      },
      {
        month: '2026-11',
        exhibitorId: 'shop-2',
        shopName: 'パン屋',
        paidCount: 1,
        paidAmount: 2000,
        failedCount: 0,
      },
    ]);
  });

  it('日付として読めない記録は除く', () => {
    const summary = summarizeBillingPayments(
      [paymentRecord({ paidAt: 'not-a-date', occurredAt: 'not-a-date' })],
      exhibitors,
    );
    expect(summary.daily).toEqual([]);
    expect(summary.totalPaidCount).toBe(0);
  });
});

describe('buildBillingSummaryCsv', () => {
  it('セクション見出しと集計行を出す', () => {
    const summary = summarizeBillingPayments(
      [paymentRecord()],
      [{ id: 'shop-1', name: 'カレー堂' }],
    );
    const csv = buildBillingSummaryCsv(summary);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines).toContain('【日次集計】');
    expect(lines).toContain('【月次集計】');
    expect(lines).toContain('【年次集計】');
    expect(lines).toContain('【出店者別月次集計】');
    expect(lines).toContain('2026-11-02,1,3000,0');
    expect(lines).toContain('2026-11,カレー堂,1,3000,0');
    expect(lines).toContain('【総合計】');
    expect(lines[lines.length - 1]).toBe('1,3000,0');
  });
});

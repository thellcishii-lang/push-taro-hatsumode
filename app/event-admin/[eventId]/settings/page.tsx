'use client';

// app/event-admin/[eventId]/settings/page.tsx
// Push-taro 初詣 主催者向けの設定画面。
// 参拝者登録用QRコードの表示・ダウンロード、案内PDFの管理
// （アップロード／一覧／削除、最大5件）と、主催者リンクの管理
// （タイトル＋URL、最大3件）を行う。
// 以前はクーポン管理画面の中にあったが、設定系の項目の受け皿として
// 独立した画面に移した（2026-11-11）。今後設定項目が増えたらここに置く。
// 画面の固定文は4言語辞書（lib/ui-text.ts の ADMIN_TEXT）。
// 見た目は承認済みモック準拠。ログイン後は共通シェル（components/AdminShell）
// を使い、PC は左サイドバー固定の2カラム、スマホはアコーディオンになる。
// フィードバック文はフォームの直下に出す。
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, storage } from '@/lib/firebase-client';
import { AdminLanguageSelect, useAdminLocale } from '@/components/AdminLocale';
import {
  ADMIN_CARD_BORDER,
  ADMIN_CARD_SHADOW,
  ADMIN_PAGE_BG,
  AdminBrandBar,
  ButtonSpinner,
  adminButtonContentStyle,
  adminErrorTextStyle,
  adminFeedbackStyle,
  adminPageTitleStyle,
} from '@/components/AdminBrand';
import { adminText, uiText } from '@/lib/ui-text';
import { MAX_GACHA_RANK, type GachaPrize } from '@/lib/event';
import { AdminShell } from '@/components/AdminShell';
import { CapWarningBanner } from '@/components/CapWarningBanner';
import { AdminNav } from '../AdminNav';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { useDropzone } from 'react-dropzone';
import { VisitorQr } from '@/components/VisitorQr';

interface InfoPdf {
  id: string;
  title: string;
  url: string;
}

/** ガチャ等位の編集行（入力欄は文字列で持つ。当選上限の空欄は無制限）。 */
interface GachaPrizeRow {
  name: string;
  probability: string;
  stock: string;
}

function emptyPrizeRows(): GachaPrizeRow[] {
  return Array.from({ length: MAX_GACHA_RANK }, () => ({
    name: '',
    probability: '',
    stock: '',
  }));
}

const VIOLET = '#B3352B';

const containerStyle: React.CSSProperties = {
  padding: '20px 16px 48px',
  maxWidth: 880,
  margin: '0 auto',
  fontFamily: 'sans-serif',
  backgroundColor: ADMIN_PAGE_BG,
  minHeight: '100vh',
  boxSizing: 'border-box',
  color: '#0f172a',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: `1px solid ${ADMIN_CARD_BORDER}`,
  borderRadius: 18,
  boxShadow: ADMIN_CARD_SHADOW,
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '11px 12px',
  marginTop: 6,
  border: '1px solid #D9D4EC',
  borderRadius: 12,
  fontSize: 14,
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 12,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '12px 22px',
  fontWeight: 700,
  fontSize: 15,
  backgroundColor: VIOLET,
  color: '#ffffff',
  border: 'none',
  borderRadius: 12,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(179, 53, 43, 0.25)',
};

const dangerButtonStyle: React.CSSProperties = {
  padding: '7px 16px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 12,
  border: '1px solid #fca5a5',
  backgroundColor: '#ffffff',
  color: '#b91c1c',
  cursor: 'pointer',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  margin: 0,
};

export default function EventSettingsAdminPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [locale, setLocale] = useAdminLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [eventName, setEventName] = useState('');
  const [pdfs, setPdfs] = useState<InfoPdf[]>([]);
  const [linkSlots, setLinkSlots] = useState<Array<{ title: string; url: string }>>([
    { title: '', url: '' },
    { title: '', url: '' },
    { title: '', url: '' },
  ]);
  const [linksMessage, setLinksMessage] = useState('');
  const [linksSaving, setLinksSaving] = useState(false);
  const [omikujiEnabled, setOmikujiEnabled] = useState(true);
  const [gachaEnabled, setGachaEnabled] = useState(false);
  const [prizeRows, setPrizeRows] = useState<GachaPrizeRow[]>(emptyPrizeRows);
  const [funMessage, setFunMessage] = useState('');
  const [funSaving, setFunSaving] = useState(false);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfUploading, setPdfUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [loadMessage, setLoadMessage] = useState('');
  const [pdfMessage, setPdfMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const callApi = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!user) throw new Error(adminText(locale, 'loginRequired'));
      const idToken = await user.getIdToken();
      const res = await fetch(path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          ...(init?.headers ?? {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error ?? adminText(locale, 'apiError', { status: String(res.status) }));
      return data;
    },
    [user, locale],
  );

  const loadPdfs = useCallback(async () => {
    if (!user) return;
    try {
      const pdfData = await callApi(`/api/events/${eventId}/info-pdfs`);
      setPdfs(pdfData.pdfs ?? []);
      setLoadMessage('');
    } catch (e) {
      setLoadMessage(e instanceof Error ? e.message : adminText(locale, 'loadFailed'));
    }
  }, [user, eventId, callApi, locale]);

  useEffect(() => {
    if (user) void loadPdfs();
  }, [user, loadPdfs]);

  const loadLinks = useCallback(async () => {
    if (!user) return;
    try {
      const data = await callApi(`/api/events/${eventId}`);
      if (typeof data.event?.name === 'string') setEventName(data.event.name);
      const links: Array<{ title: string; url: string }> = data.event?.links ?? [];
      setLinkSlots(
        [0, 1, 2].map((i) => ({
          title: links[i]?.title ?? '',
          url: links[i]?.url ?? '',
        })),
      );
    } catch {
      // リンクが読み込めなくてもPDF管理は止めない
    }
  }, [user, eventId, callApi]);

  useEffect(() => {
    if (user) void loadLinks();
  }, [user, loadLinks]);

  const updateLinkSlot = (index: number, field: 'title' | 'url', value: string) => {
    setLinkSlots((slots) =>
      slots.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)),
    );
  };

  const handleSaveLinks = async () => {
    const normalized: Array<{ title: string; url: string }> = [];
    for (const slot of linkSlots) {
      const title = slot.title.trim();
      const url = slot.url.trim();
      if (!title && !url) continue;
      if (!title || !url) {
        setLinksMessage(adminText(locale, 'linkPairError'));
        return;
      }
      if (!url.startsWith('https://')) {
        setLinksMessage(adminText(locale, 'linkUrlError'));
        return;
      }
      normalized.push({ title, url });
    }
    setLinksSaving(true);
    setLinksMessage('');
    try {
      await callApi(`/api/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ links: normalized }),
      });
      setLinksMessage(adminText(locale, 'linksSaved'));
      setLinkSlots(
        [0, 1, 2].map((i) => ({
          title: normalized[i]?.title ?? '',
          url: normalized[i]?.url ?? '',
        })),
      );
    } catch (e) {
      setLinksMessage(e instanceof Error ? e.message : adminText(locale, 'linksSaveFailed'));
    } finally {
      setLinksSaving(false);
    }
  };

  const loadFunSettings = useCallback(async () => {
    if (!user) return;
    try {
      const data = await callApi(`/api/events/${eventId}`);
      setOmikujiEnabled(data.event?.omikujiEnabled !== false);
      setGachaEnabled(data.event?.gachaEnabled === true);
      const prizes: GachaPrize[] = Array.isArray(data.event?.gachaPrizes)
        ? data.event.gachaPrizes
        : [];
      const rows = emptyPrizeRows();
      for (const prize of prizes) {
        if (prize.rank >= 1 && prize.rank <= MAX_GACHA_RANK) {
          rows[prize.rank - 1] = {
            name: prize.name ?? '',
            probability: String(prize.probability ?? ''),
            stock: prize.stock === null || prize.stock === undefined ? '' : String(prize.stock),
          };
        }
      }
      setPrizeRows(rows);
    } catch {
      // おみくじ・ガチャ設定が読み込めなくても他の管理は止めない
    }
  }, [user, eventId, callApi]);

  useEffect(() => {
    if (user) void loadFunSettings();
  }, [user, loadFunSettings]);

  const updatePrizeRow = (index: number, field: keyof GachaPrizeRow, value: string) => {
    setPrizeRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const probabilityTotal = prizeRows.reduce((sum, row) => {
    const value = Number(row.probability.trim());
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const handleSaveFunSettings = async () => {
    const prizes: GachaPrize[] = [];
    for (let i = 0; i < prizeRows.length; i++) {
      const row = prizeRows[i];
      const name = row.name.trim();
      const probabilityText = row.probability.trim();
      const stockText = row.stock.trim();
      if (!name && !probabilityText && !stockText) continue;
      if (
        (probabilityText !== '' && !/^\d+$/.test(probabilityText)) ||
        (stockText !== '' && !/^\d+$/.test(stockText))
      ) {
        setFunMessage(adminText(locale, 'gachaNumberError'));
        return;
      }
      const probability = probabilityText === '' ? 0 : Number(probabilityText);
      if (probability > 100) {
        setFunMessage(adminText(locale, 'gachaNumberError'));
        return;
      }
      if (probability > 0 && !name) {
        setFunMessage(adminText(locale, 'gachaPrizeNameRequired', { n: String(i + 1) }));
        return;
      }
      prizes.push({
        rank: i + 1,
        name,
        probability,
        stock: stockText === '' ? null : Number(stockText),
      });
    }
    if (probabilityTotal > 100) {
      setFunMessage(adminText(locale, 'gachaProbabilityOver'));
      return;
    }
    setFunSaving(true);
    setFunMessage('');
    try {
      await callApi(`/api/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ omikujiEnabled, gachaEnabled, gachaPrizes: prizes }),
      });
      setFunMessage(adminText(locale, 'funSettingsSaved'));
    } catch (e) {
      setFunMessage(e instanceof Error ? e.message : adminText(locale, 'funSettingsSaveFailed'));
    } finally {
      setFunSaving(false);
    }
  };

  const handleLogin = async () => {
    setBusy(true);
    setMessage('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setMessage(adminText(locale, 'loginFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handlePdfDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file || !user) return;
      setPdfUploading(true);
      setPdfMessage('');
      try {
        const storagePath = `organizers/${user.uid}/events/${eventId}/info-pdfs/${crypto.randomUUID()}.pdf`;
        const ref = storageRef(storage, storagePath);
        await uploadBytes(ref, file, { contentType: 'application/pdf' });
        const url = await getDownloadURL(ref);
        await callApi(`/api/events/${eventId}/info-pdfs`, {
          method: 'POST',
          body: JSON.stringify({
            title: pdfTitle.trim() || file.name.replace(/\.pdf$/i, ''),
            url,
            storagePath,
          }),
        });
        setPdfTitle('');
        setPdfMessage(adminText(locale, 'pdfAdded'));
        await loadPdfs();
      } catch (e) {
        setPdfMessage(e instanceof Error ? e.message : adminText(locale, 'pdfAddFailed'));
      } finally {
        setPdfUploading(false);
      }
    },
    [user, eventId, pdfTitle, callApi, loadPdfs, locale],
  );

  const pdfDropzone = useDropzone({
    onDrop: handlePdfDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: pdfUploading || pdfs.length >= 5,
  });

  const handleDeletePdf = async (pdfId: string) => {
    if (!window.confirm(adminText(locale, 'confirmDeletePdf'))) return;
    setBusy(true);
    setPdfMessage('');
    try {
      await callApi(`/api/events/${eventId}/info-pdfs/${pdfId}`, { method: 'DELETE' });
      setPdfMessage(adminText(locale, 'pdfDeleted'));
      await loadPdfs();
    } catch (e) {
      setPdfMessage(e instanceof Error ? e.message : adminText(locale, 'pdfDeleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!authReady) return <main style={containerStyle}>{uiText(locale, 'loading')}</main>;

  if (!user) {
    return (
      <main style={{ ...containerStyle, maxWidth: 480 }}>
        <AdminBrandBar right={<AdminLanguageSelect locale={locale} onChange={setLocale} />} />
        <section style={{ ...cardStyle, padding: 24, marginTop: 16 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 16px' }}>{adminText(locale, 'adminLoginTitle')}</h1>
          <label style={labelStyle}>
            {adminText(locale, 'emailLabel')}
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={labelStyle}>
            {adminText(locale, 'passwordLabel')}
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button onClick={handleLogin} disabled={busy} style={{ ...primaryButtonStyle, width: '100%' }}>
            <span style={adminButtonContentStyle}>
              {busy && <ButtonSpinner />}
              {adminText(locale, 'loginButton')}
            </span>
          </button>
          {message && <p style={{ color: '#b91c1c', marginTop: 12, fontSize: 14 }}>{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <AdminShell
      locale={locale}
      email={user.email}
      onLogout={() => void signOut(auth)}
      languageSelect={<AdminLanguageSelect locale={locale} onChange={setLocale} />}
      nav={<AdminNav eventId={eventId} eventName={eventName} current="⑤" locale={locale} />}
    >
      <h1 style={adminPageTitleStyle}>{adminText(locale, 'settingsPageTitle')}</h1>
      <CapWarningBanner locale={locale} />
      {loadMessage && <p style={adminErrorTextStyle}>{loadMessage}</p>}

      <section style={{ marginTop: 22 }}>
        <h2 style={sectionTitleStyle}>{adminText(locale, 'visitorQrTitle')}</h2>
        <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 5 }}>
          {adminText(locale, 'visitorQrNote')}
        </p>
        <div style={{ ...cardStyle, marginTop: 12, padding: 24 }}>
          <VisitorQr
            eventId={eventId}
            locale={locale}
            showUrl
            buttonStyle={primaryButtonStyle}
          />
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={sectionTitleStyle}>
          {adminText(locale, 'pdfsTitle', { count: String(pdfs.length) })}
        </h2>
        <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 5 }}>
          {adminText(locale, 'pdfsNote')}
        </p>
        {pdfs.map((pdf) => (
          <div
            key={pdf.id}
            style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', marginTop: 12 }}
          >
            <a href={pdf.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 600, color: VIOLET }}>
              {pdf.title}
            </a>
            <button onClick={() => void handleDeletePdf(pdf.id)} disabled={busy} style={dangerButtonStyle}>
              {adminText(locale, 'deleteButton')}
            </button>
          </div>
        ))}
        {pdfMessage && <p style={adminFeedbackStyle}>{pdfMessage}</p>}
        <div style={{ ...cardStyle, marginTop: 12, padding: 24 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>
            {adminText(locale, 'pdfTitleLabel')}
            <input style={inputStyle} value={pdfTitle} onChange={(e) => setPdfTitle(e.target.value)} placeholder={adminText(locale, 'pdfTitlePlaceholder')} />
          </label>
          <div
            {...pdfDropzone.getRootProps()}
            style={{
              border: `2px dashed ${pdfDropzone.isDragActive ? '#B3352B' : '#c4b5fd'}`,
              backgroundColor: pdfDropzone.isDragActive ? '#f5f3ff' : '#ffffff',
              borderRadius: 16,
              padding: 24,
              marginTop: 12,
              textAlign: 'center',
              fontSize: 14,
              color: '#475569',
              cursor: pdfs.length >= 5 ? 'not-allowed' : 'pointer',
              opacity: pdfs.length >= 5 ? 0.5 : 1,
            }}
          >
            <input {...pdfDropzone.getInputProps()} />
            {pdfUploading
              ? adminText(locale, 'pdfUploading')
              : pdfs.length >= 5
                ? adminText(locale, 'pdfCapReached')
                : adminText(locale, 'pdfDropHint')}
          </div>
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={sectionTitleStyle}>{adminText(locale, 'organizerLinksTitle')}</h2>
        <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 5 }}>
          {adminText(locale, 'organizerLinksNote')}
        </p>
        <div style={{ ...cardStyle, marginTop: 12, padding: 24 }}>
          {linkSlots.map((slot, i) => (
            <div key={i} style={{ marginBottom: i < linkSlots.length - 1 ? 20 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {adminText(locale, 'linkSlotLabel', { n: String(i + 1) })}
              </div>
              <label style={labelStyle}>
                {adminText(locale, 'linkTitleLabel')}
                <input
                  style={inputStyle}
                  value={slot.title}
                  onChange={(e) => updateLinkSlot(i, 'title', e.target.value)}
                />
              </label>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                {adminText(locale, 'linkUrlLabel')}
                <input
                  style={inputStyle}
                  value={slot.url}
                  onChange={(e) => updateLinkSlot(i, 'url', e.target.value)}
                  placeholder="https://"
                  inputMode="url"
                />
              </label>
            </div>
          ))}
          <button
            onClick={() => void handleSaveLinks()}
            disabled={linksSaving}
            style={{ ...primaryButtonStyle, marginTop: 20 }}
          >
            <span style={adminButtonContentStyle}>
              {linksSaving && <ButtonSpinner />}
              {adminText(locale, 'linksSaveButton')}
            </span>
          </button>
          {linksMessage && <p style={adminFeedbackStyle}>{linksMessage}</p>}
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={sectionTitleStyle}>{adminText(locale, 'funSettingsTitle')}</h2>
        <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 5 }}>
          {adminText(locale, 'funSettingsNote')}
        </p>
        <div style={{ ...cardStyle, marginTop: 12, padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={omikujiEnabled}
                onChange={(e) => setOmikujiEnabled(e.target.checked)}
              />{' '}
              {adminText(locale, 'omikujiEnabledLabel')}
            </label>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {adminText(locale, 'omikujiEnabledNote')}
            </span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={gachaEnabled}
                onChange={(e) => setGachaEnabled(e.target.checked)}
              />{' '}
              {adminText(locale, 'gachaEnabledLabel')}
            </label>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {adminText(locale, 'gachaEnabledNote')}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: '#64748b',
              marginBottom: 4,
            }}
          >
            <span style={{ width: 40, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{adminText(locale, 'gachaPrizeNameLabel')}</span>
            <span style={{ width: 84, flexShrink: 0 }}>{adminText(locale, 'gachaProbabilityLabel')}</span>
            <span style={{ width: 104, flexShrink: 0 }}>{adminText(locale, 'gachaStockLabel')}</span>
          </div>
          {prizeRows.map((row, i) => (
            <div
              key={i}
              style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}
            >
              <span style={{ width: 40, flexShrink: 0, fontSize: 13, fontWeight: 700 }}>
                {adminText(locale, 'gachaRankLabel', { n: String(i + 1) })}
              </span>
              <input
                style={{ ...inputStyle, marginTop: 0, flex: 1 }}
                value={row.name}
                onChange={(e) => updatePrizeRow(i, 'name', e.target.value)}
              />
              <input
                style={{ ...inputStyle, marginTop: 0, width: 84, flexShrink: 0 }}
                value={row.probability}
                onChange={(e) => updatePrizeRow(i, 'probability', e.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
              <input
                style={{ ...inputStyle, marginTop: 0, width: 104, flexShrink: 0 }}
                value={row.stock}
                onChange={(e) => updatePrizeRow(i, 'stock', e.target.value)}
                inputMode="numeric"
                placeholder={adminText(locale, 'gachaStockPlaceholder')}
              />
            </div>
          ))}
          <p
            style={{
              fontSize: 13,
              marginTop: 14,
              color: probabilityTotal > 100 ? '#b91c1c' : '#334155',
              fontWeight: probabilityTotal > 100 ? 700 : 400,
            }}
          >
            {adminText(locale, 'gachaProbabilityTotal', { total: String(probabilityTotal) })}
            {probabilityTotal > 100 && `（${adminText(locale, 'gachaProbabilityOver')}）`}
          </p>
          <button
            onClick={() => void handleSaveFunSettings()}
            disabled={funSaving}
            style={{ ...primaryButtonStyle, marginTop: 8 }}
          >
            <span style={adminButtonContentStyle}>
              {funSaving && <ButtonSpinner />}
              {adminText(locale, 'funSettingsSaveButton')}
            </span>
          </button>
          {funMessage && <p style={adminFeedbackStyle}>{funMessage}</p>}
        </div>
      </section>
    </AdminShell>
  );
}

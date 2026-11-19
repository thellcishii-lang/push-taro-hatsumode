'use client';

// app/event-admin/[eventId]/timetable/page.tsx
// Push-taro 初詣 主催者向けの行事予定（タイムテーブル）管理画面。
// 正月の行事（祭典・神楽・祈祷・授与所の時間など）を登録すると、
// 参拝者画面に日時順の一覧で表示される。1イベント・1リストの簡易版。
// 文面は作成時に自動翻訳される（配信と同じ仕組み）。
// 画面の固定文は4言語辞書（lib/ui-text.ts の ADMIN_TEXT）。
// フィードバック文はフォームの直下／一覧の直上に出す。
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
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
import { AdminShell } from '@/components/AdminShell';
import { CapWarningBanner } from '@/components/CapWarningBanner';
import { AdminNav } from '../AdminNav';

interface ScheduleEntry {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string | null;
  place: string;
  note: string;
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

const smallButtonStyle: React.CSSProperties = {
  padding: '7px 16px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  color: '#334155',
  cursor: 'pointer',
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

export default function EventTimetableAdminPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [locale, setLocale] = useAdminLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [eventName, setEventName] = useState('');
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loadMessage, setLoadMessage] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [saving, setSaving] = useState(false);
  // 編集中の行事ID。null は新規追加モード。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');

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
          ['Authori' + 'zation']: `Bearer ${idToken}`,
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

  const loadEntries = useCallback(async () => {
    if (!user) return;
    try {
      const data = await callApi(`/api/events/${eventId}/schedule`);
      setEntries(data.entries ?? []);
      setLoadMessage('');
    } catch (e) {
      setLoadMessage(e instanceof Error ? e.message : adminText(locale, 'loadFailed'));
    }
  }, [user, eventId, callApi, locale]);

  useEffect(() => {
    if (user) void loadEntries();
  }, [user, loadEntries]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await callApi(`/api/events/${eventId}`);
        if (typeof data.event?.name === 'string') setEventName(data.event.name);
      } catch {
        // イベント名が読めなくても行事管理は止めない
      }
    })();
  }, [user, eventId, callApi]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDate('');
    setStartTime('');
    setEndTime('');
    setPlace('');
    setNote('');
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

  const handleSave = async () => {
    setSaving(true);
    setFormMessage('');
    try {
      const payload = JSON.stringify({
        title,
        date,
        startTime,
        endTime: endTime || null,
        place,
        note,
      });
      if (editingId) {
        await callApi(`/api/events/${eventId}/schedule/${editingId}`, {
          method: 'PATCH',
          body: payload,
        });
        setFormMessage(adminText(locale, 'timetableUpdated'));
      } else {
        await callApi(`/api/events/${eventId}/schedule`, {
          method: 'POST',
          body: payload,
        });
        setFormMessage(adminText(locale, 'timetableAdded'));
      }
      resetForm();
      await loadEntries();
    } catch (e) {
      setFormMessage(e instanceof Error ? e.message : adminText(locale, 'timetableSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (entry: ScheduleEntry) => {
    setEditingId(entry.id);
    setTitle(entry.title);
    setDate(entry.date);
    setStartTime(entry.startTime);
    setEndTime(entry.endTime ?? '');
    setPlace(entry.place);
    setNote(entry.note);
    setFormMessage('');
  };

  const handleDelete = async (entryId: string) => {
    if (!window.confirm(adminText(locale, 'confirmDeleteTimetableEntry'))) return;
    setBusy(true);
    setFormMessage('');
    try {
      await callApi(`/api/events/${eventId}/schedule/${entryId}`, { method: 'DELETE' });
      if (editingId === entryId) resetForm();
      setFormMessage(adminText(locale, 'timetableDeleted'));
      await loadEntries();
    } catch (e) {
      setFormMessage(e instanceof Error ? e.message : adminText(locale, 'timetableDeleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!authReady) return <main style={containerStyle}>{uiText(locale, 'loading')}</main>;

  if (!user) {
    return (
      <main style={containerStyle}>
        <AdminBrandBar right={<AdminLanguageSelect locale={locale} onChange={setLocale} />} />
        <section style={{ ...cardStyle, marginTop: 20, padding: 20 }}>
          <label style={labelStyle}>
            {adminText(locale, 'emailLabel')}
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={labelStyle}>
            {adminText(locale, 'passwordLabel')}
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button onClick={() => void handleLogin()} disabled={busy} style={primaryButtonStyle}>
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

  // 日付ごとにグループ化（一覧はAPI側で日時順に整っている前提で、出現順を保つ）
  const groups: Array<{ date: string; entries: ScheduleEntry[] }> = [];
  for (const entry of entries) {
    const group = groups.find((g) => g.date === entry.date);
    if (group) group.entries.push(entry);
    else groups.push({ date: entry.date, entries: [entry] });
  }

  return (
    <AdminShell
      locale={locale}
      email={user.email}
      onLogout={() => void signOut(auth)}
      languageSelect={<AdminLanguageSelect locale={locale} onChange={setLocale} />}
      nav={<AdminNav eventId={eventId} eventName={eventName} current="⑥" locale={locale} />}
    >
      <h1 style={adminPageTitleStyle}>{adminText(locale, 'timetablePageTitle')}</h1>
      <CapWarningBanner locale={locale} />
      <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 8 }}>
        {adminText(locale, 'timetableNote')}
      </p>
      {loadMessage && <p style={adminErrorTextStyle}>{loadMessage}</p>}

      <section style={{ ...cardStyle, marginTop: 16, padding: 20 }}>
        <label style={labelStyle}>
          {adminText(locale, 'timetableTitleLabel')}
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...labelStyle, flex: '1 1 150px' }}>
            {adminText(locale, 'timetableDateLabel')}
            <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label style={{ ...labelStyle, flex: '1 1 110px' }}>
            {adminText(locale, 'timetableStartLabel')}
            <input style={inputStyle} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label style={{ ...labelStyle, flex: '1 1 110px' }}>
            {adminText(locale, 'timetableEndLabel')}
            <input style={inputStyle} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
        <label style={labelStyle}>
          {adminText(locale, 'timetablePlaceLabel')}
          <input style={inputStyle} value={place} onChange={(e) => setPlace(e.target.value)} />
        </label>
        <label style={{ ...labelStyle, marginBottom: 0 }}>
          {adminText(locale, 'timetableNoteLabel')}
          <textarea
            style={{ ...inputStyle, minHeight: 64 }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => void handleSave()} disabled={saving} style={primaryButtonStyle}>
            <span style={adminButtonContentStyle}>
              {saving && <ButtonSpinner />}
              {editingId ? adminText(locale, 'saveButton') : adminText(locale, 'timetableAddButton')}
            </span>
          </button>
          {editingId && (
            <button
              onClick={() => {
                resetForm();
                setFormMessage('');
              }}
              disabled={saving}
              style={{ ...smallButtonStyle, padding: '12px 18px' }}
            >
              {adminText(locale, 'cancelButton')}
            </button>
          )}
        </div>
        {formMessage && <p style={adminFeedbackStyle}>{formMessage}</p>}
      </section>

      <section style={{ marginTop: 28 }}>
        {entries.length === 0 && (
          <p style={{ fontSize: 14, color: '#64748b' }}>{adminText(locale, 'timetableEmpty')}</p>
        )}
        {groups.map((group) => (
          <div key={group.date} style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
              {group.date.replaceAll('-', '/')}
            </h2>
            {group.entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  ...cardStyle,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 16px',
                  marginTop: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                    {entry.startTime}
                    {entry.endTime ? `〜${entry.endTime}` : ''}　{entry.title}
                  </p>
                  {entry.place && (
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>{entry.place}</p>
                  )}
                  {entry.note && (
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b', whiteSpace: 'pre-wrap' }}>
                      {entry.note}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => handleEdit(entry)} disabled={busy} style={smallButtonStyle}>
                    {adminText(locale, 'editButton')}
                  </button>
                  <button onClick={() => void handleDelete(entry.id)} disabled={busy} style={dangerButtonStyle}>
                    {adminText(locale, 'deleteButton')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>
    </AdminShell>
  );
}

// components/VisitorSchedule.tsx
// 参拝者画面の「行事予定」セクション。主催者が登録した行事を
// 日付ごとにまとめ、時刻順に並べて表示する（public API の
// 表示言語で解決済みの文字列を受け取る）。
import type { Locale } from '@/lib/i18n';
import { uiText } from '@/lib/ui-text';
import { groupScheduleByDate } from '@/lib/schedule-view';

export interface VisitorScheduleEntry {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  place: string;
  note: string;
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  padding: 16,
};

/** 日付見出し（例: 1月1日(水)）。日付は日本時間の日付として解釈する。 */
function formatDateHeading(date: string, locale: Locale): string {
  const parsed = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const intlLocale =
    locale === 'zh' ? 'zh-CN' : locale === 'ko' ? 'ko-KR' : locale === 'en' ? 'en-US' : 'ja-JP';
  try {
    return new Intl.DateTimeFormat(intlLocale, {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'Asia/Tokyo',
    }).format(parsed);
  } catch {
    return date;
  }
}

export function VisitorSchedule({
  entries,
  locale,
}: {
  entries: VisitorScheduleEntry[];
  locale: Locale;
}) {
  if (entries.length === 0) return null;
  const groups = groupScheduleByDate(entries);
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800 }}>
        🗓 {uiText(locale, 'scheduleTitle')}
      </h2>
      <div style={{ ...cardStyle, marginTop: 8 }}>
        {groups.map((group, groupIndex) => (
          <div
            key={group.date}
            style={{ marginTop: groupIndex === 0 ? 0 : 16 }}
          >
            <p
              style={{
                fontSize: 13.5,
                fontWeight: 800,
                color: '#B3352B',
                margin: 0,
                borderBottom: '1px solid #F0D9AE',
                paddingBottom: 4,
              }}
            >
              {formatDateHeading(group.date, locale)}
            </p>
            {group.entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: '1px dashed #eee7da',
                }}
              >
                <p
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    margin: 0,
                    whiteSpace: 'nowrap',
                    color: '#2A1E17',
                  }}
                >
                  {entry.startTime}
                  {entry.endTime ? `–${entry.endTime}` : ''}
                </p>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14.5, fontWeight: 700, margin: 0 }}>
                    {entry.title}
                  </p>
                  {entry.place && (
                    <p style={{ fontSize: 13, margin: '2px 0 0', color: '#5c4a3a' }}>
                      📍 {entry.place}
                    </p>
                  )}
                  {entry.note && (
                    <p
                      style={{
                        fontSize: 13,
                        margin: '2px 0 0',
                        color: '#5c4a3a',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {entry.note}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

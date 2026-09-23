import { RADIUS, SPACE } from '../spacing';
import { TYPE_SIZE } from '../typography';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A real calendar-grid popup, not the OS-native input[type=date]
// popover — Zahid's own steer ("real calendar-grid popup, modern clean
// design"). Two call sites reuse this: PlanningWeeklyLevel.tsx's task
// day-picker ("Any date…", picking a date schedules a PlanTask) and
// Panel3.tsx's DAILY header ("Jump to date", picking a date just
// navigates DAILY there — no task involved). Neither Weekly's own
// 7-day strip nor Monthly's hardcoded-to-the-real-month grid can reach
// an arbitrary month, which is the whole point of this component.
export default function MiniCalendarPicker({
  year,
  month,
  selected,
  accent,
  onNavMonth,
  onSelectDate,
}: {
  year: number;
  month: number; // 1-indexed
  selected: string | null;
  accent: string;
  onNavMonth: (dir: 1 | -1) => void;
  onSelectDate: (iso: string) => void;
}) {
  const todayIso = isoDate(new Date());
  const first = new Date(year, month - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-start
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: { date: number; iso: string }[] = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    return { date: d, iso: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  });

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: RADIUS.card,
        background: 'var(--surface)',
        padding: SPACE.sm,
        width: 220,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: SPACE.xs }}>
        <button type="button" className="hover-accent" onClick={() => onNavMonth(-1)} title="Previous month" style={{ background: 'transparent', border: 'none', padding: `0 ${SPACE.xs}px`, fontWeight: 700 }}>
          ‹
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: TYPE_SIZE.xs, fontWeight: 700, color: 'var(--text)' }}>
          {MONTH_ABBR[month - 1]} {year}
        </span>
        <button type="button" className="hover-accent" onClick={() => onNavMonth(1)} title="Next month" style={{ background: 'transparent', border: 'none', padding: `0 ${SPACE.xs}px`, fontWeight: 700 }}>
          ›
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {WEEKDAY_LETTERS.map((w, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {Array.from({ length: startOffset }, (_, i) => <span key={`pad-${i}`} />)}
        {cells.map((c) => {
          const isToday = c.iso === todayIso;
          const isSelected = c.iso === selected;
          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => onSelectDate(c.iso)}
              className="hover-outline"
              style={{
                padding: '4px 0',
                borderRadius: RADIUS.control,
                border: 'none',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: TYPE_SIZE.xs,
                background: isSelected ? accent : isToday ? `color-mix(in srgb, ${accent} 16%, transparent)` : undefined,
                color: isSelected ? 'var(--on-accent)' : isToday ? accent : 'var(--text-muted)',
                fontWeight: isSelected || isToday ? 700 : 400,
              }}
            >
              {c.date}
            </button>
          );
        })}
      </div>
    </div>
  );
}

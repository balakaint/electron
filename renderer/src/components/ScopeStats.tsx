import { useEffect, useState } from 'react';
import { Q90Panel, quarterlyApi } from '../services/api';
import { useL } from '../i18n';
import { RADIUS, SPACE } from '../spacing';

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

function dayOfYear(d: Date): number {
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
}

// The three horizons the day sits inside — this month, this year, and
// the 90-day plan — as three equal tiles with one number each. They used
// to be one centred line of text under the clock ("September · 6 days
// left · 2026 · 3 months left") plus the quarter as a link tucked into
// the review card's tab row: three answers to the same "how much is
// left" question, spread over two cards and two type treatments. Side
// by side, with the same bar under each, they compare at a glance.
function Tile({
  label,
  value,
  sub,
  pct,
  color,
  onClick,
  title,
}: {
  label: string;
  value: string;
  sub: string;
  pct: number;
  color: string;
  onClick?: () => void;
  title?: string;
}) {
  const body = (
    <>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{value}</span>
      <span style={{ height: 4, borderRadius: RADIUS.pill, background: 'var(--border)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`, background: color }} />
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
    </>
  );
  const style = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: SPACE.xs,
    minWidth: 0,
    padding: SPACE.sm,
    borderRadius: RADIUS.card,
    border: '1px solid var(--border)',
    background: 'var(--surface-2, var(--surface))',
    textAlign: 'left' as const,
    color: 'var(--text)',
  };
  return onClick ? (
    <button onClick={onClick} title={title} className="hover-tint" style={{ ...style, cursor: 'pointer', font: 'inherit' }}>
      {body}
    </button>
  ) : (
    <div style={style}>{body}</div>
  );
}

export default function ScopeStats({ now, onOpenQuarterly }: { now: Date; onOpenQuarterly: () => void }) {
  const L = useL();
  const [panel, setPanel] = useState<Q90Panel | null>(null);

  useEffect(() => {
    quarterlyApi.getPanel().then(setPanel).catch(() => setPanel(null));
  }, []);

  const y = now.getFullYear();
  const monthDays = daysInMonth(y, now.getMonth());
  const monthLeft = monthDays - now.getDate();
  const yearDays = dayOfYear(new Date(y, 11, 31));
  const yearDay = dayOfYear(now);
  const yearLeft = yearDays - yearDay;

  // Whole and half months once there is more than a month and a half to
  // go — "98 days" is a number to work out, "3 months" is a feeling —
  // and plain days at the end of the year, where the count matters.
  const monthsLeft = 11 - now.getMonth() + monthLeft / monthDays;
  const halves = Math.round(monthsLeft * 2) / 2;
  const yearVal =
    monthsLeft < 1.5
      ? L(`${yearLeft} days left`, `${yearLeft} দিন বাকি`)
      : L(`${Math.floor(halves)}${halves % 1 ? '½' : ''} months left`, `${Math.floor(halves)}${halves % 1 ? '½' : ''} মাস বাকি`);

  const monthName = now.toLocaleDateString(undefined, { month: 'long' });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: SPACE.sm }}>
      <Tile
        label={monthName}
        value={L(`${monthLeft} days left`, `${monthLeft} দিন বাকি`)}
        sub={L(`Day ${now.getDate()} of ${monthDays}`, `${monthDays} দিনের ${now.getDate()}তম দিন`)}
        pct={now.getDate() / monthDays}
        color="var(--goal-monthly)"
      />
      <Tile
        label={String(y)}
        value={yearVal}
        sub={L(`Day ${yearDay} of ${yearDays}`, `${yearDays} দিনের ${yearDay}তম দিন`)}
        pct={yearDay / yearDays}
        color="var(--goal-yearly)"
      />
      {panel ? (
        <Tile
          label={L(`${panel.cycle_days}-day plan`, `${panel.cycle_days} দিনের প্ল্যান`)}
          value={
            panel.day === 0
              ? L(`Starts in ${panel.days_left - panel.cycle_days}d`, `${panel.days_left - panel.cycle_days} দিন পরে শুরু`)
              : L(`${panel.days_left} days left`, `${panel.days_left} দিন বাকি`)
          }
          sub={L(`${panel.areas_done}/${panel.areas_total} areas planned ›`, `${panel.areas_done}/${panel.areas_total} এরিয়া ›`)}
          pct={panel.cycle_days > 0 ? panel.day / panel.cycle_days : 0}
          color="var(--goal-weekly)"
          onClick={onOpenQuarterly}
          title="Open the quarterly plan"
        />
      ) : (
        <Tile
          label={L('90-day plan', '৯০ দিনের প্ল্যান')}
          value={L('Not set', 'সেট করা নেই')}
          sub={L('Open ›', 'খুলুন ›')}
          pct={0}
          color="var(--goal-weekly)"
          onClick={onOpenQuarterly}
          title="Open the quarterly plan"
        />
      )}
    </div>
  );
}

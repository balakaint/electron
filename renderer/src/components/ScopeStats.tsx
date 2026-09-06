import { useEffect, useState } from 'react';
import { useL } from '../i18n';
import { Settings, settingsApi } from '../services/api';
import { phaseBounds } from './DayPhaseBars';

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

// Matches legacy's _update_scope_stats: TODAY counts down to the work
// phase's own end (the same boundary the phase bars draw — reading a
// separate "work_end" setting let the two disagree about the same
// real-world thing), MONTH/YEAR are just days remaining. Only TODAY is
// something you can still act on, so only it carries the accent
// colour; MONTH/YEAR are reference facts.
export default function ScopeStats() {
  const L = useL();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    settingsApi.get().then(setSettings);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!settings) return null;

  const endH = phaseBounds(settings).work[1];
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  const end = new Date(base.getTime() + endH * 3600000);
  const leftSecs = Math.max(0, Math.round((end.getTime() - now.getTime()) / 1000));

  const today = leftSecs <= 0 ? L('work day over', 'দিন শেষ') : `${String(Math.floor(leftSecs / 3600)).padStart(2, '0')}h ${String(Math.floor((leftSecs % 3600) / 60)).padStart(2, '0')}m`;

  const y = now.getFullYear();
  const monthDays = daysInMonth(y, now.getMonth());
  const monthLeft = monthDays - now.getDate();
  const yearEnd = new Date(y, 11, 31);
  const yearLeft = Math.round((yearEnd.getTime() - new Date(y, now.getMonth(), now.getDate()).getTime()) / 86400000);

  const cards = [
    { cap: L('TODAY', 'আজ'), val: today, accent: true },
    { cap: now.toLocaleDateString(undefined, { month: 'long' }).toUpperCase(), val: `${monthLeft} days`, accent: false },
    { cap: String(y), val: `${yearLeft} days`, accent: false },
  ];

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
      {cards.map((c) => (
        <div
          key={c.cap}
          style={{
            flex: 1,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 4px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 10, opacity: 0.6 }}>{c.cap}</div>
          <div style={{ fontSize: c.val.length > 10 ? 11 : 14, fontWeight: 'bold', color: c.accent ? 'var(--accent)' : 'var(--text)' }}>
            {c.val}
          </div>
        </div>
      ))}
    </div>
  );
}

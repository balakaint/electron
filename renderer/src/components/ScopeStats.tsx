import { useEffect, useState } from 'react';
import { Settings, settingsApi } from '../services/api';

// Matches legacy's _update_scope_stats for MONTH/YEAR: just days
// remaining, reference facts rather than something to act on today.
// TODAY moved out to ClockCard's own ring (2026-09-18 redesign) —
// generalized there to "time left in the CURRENT phase" rather than
// always counting down to work's end, so it no longer belongs next to
// MONTH/YEAR's own "just days" framing.
// 28, 29, 30 or 31, asked of the calendar: day 0 of the next month is
// the last day of this one.
function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

export default function ScopeStats() {
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

  const y = now.getFullYear();
  const monthDays = daysInMonth(y, now.getMonth());
  const monthLeft = monthDays - now.getDate();
  const yearEnd = new Date(y, 11, 31);
  const yearLeft = Math.round((yearEnd.getTime() - new Date(y, now.getMonth(), now.getDate()).getTime()) / 86400000);

  // ── The year, in months ──────────────────────────────────────────
  // Three cards, three units — hours, days, months — and that is the
  // point rather than an oversight: each card is one zoom level further
  // out and speaks the unit you would actually use at that scale. Nobody
  // says "a hundred and thirteen days left in the year"; they say "about
  // four months".
  //
  // Rounded to the half month, never to a decimal. "3.2 months" claims a
  // precision this number does not have — the answer depends on which
  // months are ahead of you and how long they are — while carrying LESS
  // information than the days it was computed from. A half is a unit
  // people think in; a tenth of a month is not.
  //
  // Full months ahead plus the fraction left of this one, so the count
  // follows the calendar rather than dividing by an average month.
  const monthsLeft = 11 - now.getMonth() + monthLeft / monthDays;
  const halves = Math.round(monthsLeft * 2) / 2;
  const yearVal =
    // Under about six weeks the month becomes the wrong unit: "1 month"
    // and "½ month" are both vaguer than the days they stand for, and in
    // late December it would round to zero while the year is still open.
    monthsLeft < 1.5
      ? `${yearLeft} days`
      : `${Math.floor(halves)}${halves % 1 ? '½' : ''} months`;

  // Two reference facts, one line (2026-09-18 redesign) — MONTH/YEAR
  // never carried the accent (only TODAY, now ClockCard's ring, was
  // ever something to act on today), so giving them equal card weight
  // to that ring cost more space than two numbers you can't move
  // needed. The month still carries days, the scale a month is
  // actually planned at.
  const monthName = now.toLocaleDateString(undefined, { month: 'long' });

  return (
    // Same font-size/color tier as ClockCard's "left in phase"/"…left"
    // line right above it — same weight was reading as one continued
    // paragraph rather than two separate tiers (today's countdown vs.
    // this reference fact) (Zahid, 2026-09-24 hierarchy pass). A
    // hairline + real gap above closes off the phase section before
    // this one starts, without touching either line's own weight.
    <div
      style={{
        marginTop: 16,
        paddingTop: 8,
        borderTop: '1px solid var(--border)',
        fontSize: 12,
        textAlign: 'center',
      }}
    >
      {/* The anchor (which month/year) is the fact worth reading first;
          "N days/months left" is the same countdown framing ClockCard's
          own faint tier already uses — splitting the two into their own
          weights (Zahid, 2026-09-24) instead of one flat line. */}
      <span style={{ fontWeight: 700, color: 'var(--text)' }}>{monthName}</span>
      <span style={{ color: 'var(--text-faint)' }}> · {monthLeft} days left</span>
      <span style={{ color: 'var(--text-faint)' }}> &nbsp;·&nbsp; </span>
      <span style={{ fontWeight: 700, color: 'var(--text)' }}>{y}</span>
      <span style={{ color: 'var(--text-faint)' }}> · {yearVal} left</span>
    </div>
  );
}

// One clock formatter, because two of them drifted.
//
// StrikeCard had its own copy that divided and took a remainder without
// rounding first. Task seconds are a float while a timer runs (the
// server credits fractional elapsed time), so a running task rendered
// as "4:10.14644455909729" — the whole float, straight into the row.
//
// Legacy has exactly one fmt for this and every readout calls it. So do
// we now. Round FIRST: `secs % 60` on a float keeps the fraction, and
// that is the entire bug.
export function formatSecs(secs: number): string {
  const total = Math.max(0, Math.round(secs));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * "15m / 1h" — the ONE place this pair is worded.
 *
 * Legacy keeps it as a single static method and says why: the
 * collapsed-card line grew its own copy and wrote "0m / 60m" while the
 * open card two rows below said "15m / 1h" — the same target in two
 * different languages, which reads as two different settings
 * (task_tracker_v3_THEMES.py 2827-2838).
 *
 * This port had drifted the same way, in the same direction: both the
 * card and its collapsed preview printed the target in bare minutes, so
 * a one-hour target read as "60m" everywhere and never as "1h".
 *
 * The target only becomes hours when it divides evenly — 90 minutes
 * stays "90m" rather than becoming "1h 30m", because it is a setting you
 * cycle through (15/30/45/60/90/120) and the number you picked is the
 * number you should see.
 */
/**
 * Just the elapsed half — "15m", "1h 05m".
 *
 * The collapsed project row shows this and not the pair. The row
 * already carries a filled progress bar, which IS elapsed-against-target
 * drawn rather than written; printing "0m / 2h" beside it says the same
 * thing twice and costs 40px of a name column that was truncating
 * "PRODUCT PHOTOS" to "PRODUCT PHO…". The target survives in the row's
 * tooltip, where it is one hover away and costs nothing.
 */
export function elapsedText(secs: number): string {
  const m = Math.floor(Math.max(0, secs) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

export function projTimeText(secs: number, targetMinutes: number): string {
  const elapsed = elapsedText(secs);
  const target =
    targetMinutes >= 60 && targetMinutes % 60 === 0 ? `${targetMinutes / 60}h` : `${targetMinutes}m`;
  return `${elapsed} / ${target}`;
}

/**
 * "DAY 7" — how long a subtask has been open, counting the day it was
 * added as day 1 (legacy's _calc_day, 6965-6972).
 *
 * Legacy's note on the colour is worth keeping with the function: this
 * was hard-coded red, the same colour the app uses for risk and delete
 * hover. "DAY 37" is a neutral fact, not a warning, and it does not get
 * more alarming as the number grows — so it renders muted, as
 * information rather than an alert that never resolves.
 */
export function dayNumber(addedIso: string, today = new Date()): string {
  const added = new Date(`${addedIso}T00:00:00`);
  if (Number.isNaN(added.getTime())) return 'DAY 1';
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.floor((midnight.getTime() - added.getTime()) / 86_400_000);
  return `DAY ${Math.max(1, diff + 1)}`;
}

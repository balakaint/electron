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

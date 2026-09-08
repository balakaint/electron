import { useEffect, useRef, useState } from 'react';
import { HourPlan as HourPlanData, HourSlot, hoursApi } from '../services/api';
import { useL } from '../i18n';

// The day as 24 hour-slots, grouped into the four day-phase blocks.
// Ported from legacy's TODAY EXECUTION panel (task_tracker_v3_THEMES.py
// 5584-5830).
//
// PLACEMENT IS THE ONE DELIBERATE DIFFERENCE. Legacy puts this on the
// EXECUTE screen as the first of three tabs (HOURS | MIT | TASK LIST),
// and argues for it there: "the question at the start of a block is
// what hour am I in". Here it is the TODAY tab of the PLAN review card,
// first in the strip, ahead of Mindset — Zahid's call, and PLAN is
// where he decides what the day contains. The logic below is legacy's.
//
// Which hours belong to which block is computed server-side from the
// four phase-start settings, not stored and not duplicated here, so
// retiming the day in Settings retimes this too. Legacy's note: "One
// clock, one set of boundaries."

function hourLabel(hour: number): string {
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 || 12;
  return `${String(h12).padStart(2, '0')}:00 ${ampm}`;
}

function liveClock(): string {
  const d = new Date();
  const h12 = d.getHours() % 12 || 12;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h12)}:${p(d.getMinutes())}:${p(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Row({
  slot,
  isNow,
  color,
  onSave,
  onToggle,
  onClear,
  onToggleRepeat,
}: {
  slot: HourSlot;
  isNow: boolean;
  color: string;
  onSave: (text: string) => void;
  onToggle: () => void;
  onClear: () => void;
  onToggleRepeat: () => void;
}) {
  const L = useL();
  const [text, setText] = useState(slot.text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clock, setClock] = useState(liveClock);

  useEffect(() => setText(slot.text), [slot.text]);

  // The hour you are IN shows the live clock instead of its label.
  // Legacy: "A column of identical 09:00 AM / 10:00 AM reads as a
  // timetable; one moving number in it is what tells you where you
  // actually are without counting rows."
  useEffect(() => {
    if (!isNow) return;
    const id = setInterval(() => setClock(liveClock()), 1000);
    return () => clearInterval(id);
  }, [isNow]);

  const filled = text.trim().length > 0;
  // An empty hour recedes almost into the block behind it. Legacy's
  // reasoning: nineteen unplanned hours each drawing a circle, a
  // timestamp and a rule spend half the panel telling you, at full
  // strength, that you wrote nothing there — and the two lines you DID
  // write get lost in it. Weight follows content.
  const lit = filled || isNow;

  const save = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSave(v), 500);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0' }}>
      <button
        onClick={filled ? onToggle : undefined}
        // Nothing to tick on an empty hour, so the control is genuinely
        // inactive rather than merely styled as such.
        disabled={!filled}
        title={filled ? (slot.done ? 'Mark not done' : 'Mark done') : ''}
        style={{
          width: 24,
          height: 24,
          flex: 'none',
          border: 'none',
          background: 'transparent',
          padding: 0,
          fontSize: 12,
          cursor: filled ? 'pointer' : 'default',
          color: slot.done ? 'var(--success)' : 'var(--text-muted)',
          // The inert circle may fade all the way back: WCAG exempts
          // inactive controls from the text-contrast rule. A row you
          // HAVE written in is not inert — its circle is the tick you
          // came to press — so it gets full strength. At 0.75 it
          // measured 3.83-4.04:1 on the light themes.
          opacity: filled ? 1 : isNow ? 0.75 : 0.3,
        }}
      >
        {slot.done ? '✓' : '○'}
      </button>

      {/* The hour label is NOT inactive — it is the row's address, the
          thing that tells you which slot you are typing into — so it
          recedes but stays legible. Legacy measured its old treatment at
          1.69:1 and stopped blending it. */}
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: isNow ? 13 : 12,
          fontWeight: isNow ? 'bold' : 'normal',
          color: isNow ? color : 'var(--text-muted)',
          // No opacity dimming. --text-muted is chosen to clear 4.5:1 on
          // every theme's surface; multiplying it by 0.75 dropped these
          // labels to 3.83-4.04:1 on all four light themes. The empty
          // rows already recede three other ways — no rule under the
          // input, the circle at 0.3, the repeat and clear buttons
          // hidden — so this fourth cue was buying nothing and costing
          // the one thing on the row you have to be able to read.
          whiteSpace: 'nowrap',
        }}
      >
        {isNow ? clock : hourLabel(slot.hour)}
      </span>

      <input
        aria-label="What this hour is for"
        value={text}
        // The hour you are in is the loudest line on this panel — 14px,
        // bold, in the block's own colour — and while it was empty it
        // was the loudest line saying nothing. Emphasis has to be
        // earned: as a question it is, as a blank rule it is not. Only
        // this row gets the placeholder; twenty-four of them would be
        // the column of hairlines legacy already removed.
        placeholder={isNow && !filled ? L('What are you doing this hour?', 'এই ঘণ্টায় কী?') : ''}
        onChange={(e) => {
          setText(e.target.value);
          save(e.target.value);
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          if (text !== slot.text) onSave(text);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          // The rule appears only where there is something to underline.
          // "Twenty-four hairlines down an empty column read as a form to
          // fill in; two read as the day you actually planned."
          borderBottom: lit ? '1px solid var(--border)' : '1px solid transparent',
          background: 'transparent',
          color: slot.done ? 'var(--text-muted)' : 'var(--text)',
          // The line for RIGHT NOW is the largest thing on the screen —
          // on a panel whose whole job is one line per hour, that line
          // should outweigh the chrome around it.
          fontSize: isNow ? 14 : 13,
          fontWeight: isNow ? 'bold' : 'normal',
          textDecoration: slot.done ? 'line-through' : undefined,
          padding: '0 4px',
          height: 24,
        }}
      />

      {/* Repeat until finished. Not a habit and not a schedule: the day
          starts fresh, and this one entry keeps coming back at its hour
          until the morning after you tick it.

          Only a written row can carry — there is nothing to keep asking
          about an empty hour — and the control states which mode it is
          in rather than what the click will do, because "off" is the
          normal case and an always-lit ↻ on every row would read as a
          column of buttons rather than a mark on the one task you chose
          to keep. */}
      <button
        onClick={onToggleRepeat}
        disabled={!filled}
        aria-pressed={slot.repeat}
        title={
          slot.repeat
            ? 'Repeats every day until you finish it — click to stop'
            : 'Keep this on every day until it is finished'
        }
        style={{
          width: 24,
          height: 24,
          flex: 'none',
          border: 'none',
          background: 'transparent',
          padding: 0,
          fontSize: 12,
          cursor: filled ? 'pointer' : 'default',
          color: slot.repeat ? color : 'var(--text-faint)',
          visibility: filled ? 'visible' : 'hidden',
          fontWeight: slot.repeat ? 'bold' : 'normal',
        }}
      >
        ↻
      </button>

      {/* Only a row you have written in shows its clear button. Legacy
          tried hover-only and rejected it: that makes clearing an hour
          findable by accident and unreachable by keyboard or touch. */}
      <button
        onClick={onClear}
        title="Clear this hour"
        style={{
          width: 24,
          height: 24,
          flex: 'none',
          border: 'none',
          background: 'transparent',
          padding: 0,
          fontSize: 12,
          cursor: 'pointer',
          color: 'var(--text-muted)',
          visibility: filled ? 'visible' : 'hidden',
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default function HourPlanTab({
  refreshSignal = 0,
  onChanged,
}: {
  refreshSignal?: number;
  onChanged?: () => void;
}) {
  const L = useL();
  const [plan, setPlan] = useState<HourPlanData | null>(null);
  // In memory, deliberately not persisted. Legacy's reason: "auto-collapse
  // when its time zone isn't running" only stays true if the automatic
  // answer is what you get by default — saved to disk, one afternoon of
  // opening Morning to plan tomorrow would pin it open forever. A manual
  // toggle is "let me look at that now", not a preference.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [nowHour, setNowHour] = useState(new Date().getHours());
  const day = todayIso();

  const refresh = () => hoursApi.get(day).then(setPlan);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // NOW can now finish an hour (completing a task started from one ticks
  // it back), so this list goes stale the moment that happens. Same
  // signal Panel 3 already passes NOW itself.
  useEffect(() => {
    if (refreshSignal === 0) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // Cheap: one comparison a minute, so crossing into a new hour moves
  // the NOW badge and the live row without a reload.
  useEffect(() => {
    const id = setInterval(() => {
      const h = new Date().getHours();
      setNowHour((prev) => (prev === h ? prev : h));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowHour]);

  if (!plan) return null;

  // Every write tells the card above too. Without this, writing an
  // entry into the hour you are standing in leaves NOW still offering
  // "Choose today's 3" — it read the hour once and had no reason to
  // look again until the clock crossed into the next one.
  const set = (hour: number, patch: { text?: string; done?: boolean; repeat?: boolean }) =>
    hoursApi.set(day, hour, patch).then((r) => {
      refresh();
      onChanged?.();
      return r;
    });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 12, letterSpacing: 0.5, color: 'var(--text-faint)' }}>
          {L('TO-DO', 'আজকের কাজ')}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>({plan.total_planned})</span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 'bold',
            color:
              plan.total_planned > 0 && plan.total_done === plan.total_planned
                ? 'var(--success)'
                : undefined,
            opacity: plan.total_planned > 0 && plan.total_done === plan.total_planned ? 1 : 0.7,
          }}
        >
          {plan.total_done}/{plan.total_planned} done
        </span>
      </div>

      {plan.blocks.map((b) => {
        const isNow = b.key === plan.current_block;
        // Only the block you are IN opens by itself, and the day resets
        // that on every launch — nothing here is persisted.
        //
        // This briefly opened every block that had something written in
        // it, on the argument that a collapsed block hides the thing you
        // came to see. Zahid's correction, and he is right: with entries
        // in three blocks that is a column you have to scroll, and the
        // one signal the panel exists to give — WHICH HOUR AM I IN — is
        // buried in it. The counts on each collapsed header (0/2, 0/1)
        // already say where the day's work sits; you do not need the
        // rows to know that.
        //
        // A block you open by hand stays open until you close it, so
        // planning tonight at 10am still works — the override below
        // simply outranks this default and nothing takes it back.
        const openByDefault = isNow;
        const shown = open[b.key] ?? openByDefault;
        const color = `var(--phase-${b.key})`;
        return (
          <div
            key={b.key}
            style={{
              marginBottom: 4,
              border: '1px solid transparent',
              // A tint of the block's own colour, so the four blocks are
              // told apart by the same palette the PLAN phase bars use.
              background: `color-mix(in srgb, ${color} 9%, var(--surface))`,
            }}
          >
            <div
              onClick={() => setOpen((o) => ({ ...o, [b.key]: !(o[b.key] ?? openByDefault) }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span style={{ color, fontSize: 12 }}>{shown ? '▾' : '▸'}</span>
              {/* Names and counts step up; the captions around them stay
                  small. The block name used to be the same size as the
                  task text inside it, so nothing led the eye anywhere. */}
              {/* The block name is a LABEL for the group, not content in
                  it. At 13px bold and coloured it tied with the live
                  clock inside the block — two loudest things in one
                  card, so neither was the entry point. Caption
                  treatment: same colour, same weight, one step down and
                  tracked out, which is how a section label says "I name
                  what follows" instead of competing with it. */}
              <span style={{ color, fontSize: 12, fontWeight: 'bold', letterSpacing: 0.5 }}>{b.name}</span>
              {/* A dot, not the word NOW. "NOW" is the card pinned above
                  the tabs and it answers WHICH TASK you are on; this
                  badge answers WHICH PART OF THE DAY you are in. Two
                  different questions wearing the same word on one
                  screen made both of them vaguer. The dot, the tint and
                  the running clock in the row below already say it. */}
              {isNow && (
                <span
                  title="You are in this part of the day now"
                  aria-label="current block"
                  style={{ color, fontSize: 12, lineHeight: 1 }}
                >
                  ●
                </span>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ color, fontSize: 12, fontWeight: 'bold' }}>
                {b.done}/{b.planned}
              </span>
            </div>

            {shown && (
              <div style={{ padding: '0 8px 4px' }}>
                {b.hours.map((slot) => (
                  <Row
                    key={slot.hour}
                    slot={slot}
                    isNow={slot.hour === nowHour}
                    color={color}
                    onSave={(text) => set(slot.hour, { text })}
                    onToggle={() => set(slot.hour, { done: !slot.done })}
                    onToggleRepeat={() => set(slot.hour, { repeat: !slot.repeat })}
                    onClear={() => set(slot.hour, { text: '', done: false })}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

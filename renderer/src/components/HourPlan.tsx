import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Plus, Repeat, Scissors, X } from 'lucide-react';
import { HourBlock, HourPlan as HourPlanData, HourSlot, hoursApi } from '../services/api';
import { useFetchState } from '../hooks/useFetchState';
import { PHASE_LABELS_BN, useL, useLang } from '../i18n';
import { PROGRESS_TRACK_SOFT, RADIUS, SPACE } from '../spacing';
import { segmentHours } from '../hourSegments';

// The day as 24 hour-slots, grouped into the four day-phase blocks.
// Ported from legacy's TODAY EXECUTION panel (task_tracker_v3_THEMES.py
// 5584-5830), and laid out since 2026-09-24 as a TIMELINE rather than a
// form of 24 inputs.
//
// Which hours belong to which block is computed server-side from the
// four phase-start settings, not stored and not duplicated here, so
// retiming the day in Settings retimes this too. Legacy's note: "One
// clock, one set of boundaries."
//
// Three changes from the form it replaces, each for the same reason —
// the rows you wrote in should be the loudest thing, and the ones you
// did not should cost almost nothing:
//
//  1. SPANS. Consecutive hours holding the same text are one card with
//     an "Nh" badge ("Draft pricing page, 10 AM – 12 PM"), not the same
//     line printed twice. Editing, ticking, repeating or clearing the
//     card applies to every hour in it — the API stays per-hour.
//  2. OPEN RUNS. Consecutive empty hours fold into one dashed "3 open
//     hours" row. Pressing it opens those hours for writing. The hour
//     you are in never folds: it keeps its own row with the question
//     "What are you doing this hour?".
//  3. OVERVIEW. Above the blocks, one line of numbers and a 24-cell
//     ribbon of the whole day (planned, done, open, and where you are),
//     so the day reads at a glance before any block is opened.

function hourLabel(hour: number): string {
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 || 12} ${ampm}`;
}

function liveClock(): string {
  const d = new Date();
  const h12 = d.getHours() % 12 || 12;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${h12}:${p(d.getMinutes())}:${p(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtMins(m: number): string {
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

type SetMany = (hours: number[], patch: { text?: string; done?: boolean; repeat?: boolean }) => Promise<void>;

// The seconds tick only inside the card for the hour you are in.
function NowMeta({ spanStart, spanLen, color }: { spanStart: number; spanLen: number; color: string }) {
  const L = useL();
  const [clock, setClock] = useState(liveClock);
  useEffect(() => {
    const id = setInterval(() => setClock(liveClock()), 1000);
    return () => clearInterval(id);
  }, []);
  const d = new Date();
  const elapsed = (((d.getHours() - spanStart) % 24) + 24) % 24 * 60 + d.getMinutes();
  const left = Math.max(0, spanLen * 60 - elapsed);
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
      {L('Now', 'এখন')} · {clock} · {fmtMins(left)} {L('left', 'বাকি')}
    </span>
  );
}

// One timeline row: the time on the left, the rail with its dot, and
// whatever the row holds. Shared by written spans and open runs so the
// rail stays continuous down the block.
function TimelineRow({
  hour,
  color,
  first,
  last,
  isNow,
  dot,
  children,
}: {
  hour: number;
  color: string;
  first: boolean;
  last: boolean;
  isNow: boolean;
  dot: 'done' | 'planned' | 'open';
  children: ReactNode;
}) {
  const rail = `color-mix(in srgb, ${color} 30%, var(--surface))`;
  return (
    <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'stretch' }}>
      <span
        style={{
          width: 48,
          flex: 'none',
          paddingTop: SPACE.md,
          textAlign: 'right',
          fontSize: 12,
          fontWeight: isNow ? 700 : 600,
          color: isNow ? color : 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {hourLabel(hour)}
      </span>
      <span aria-hidden style={{ width: 12, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ width: 2, height: 12, background: first ? 'transparent' : rail }} />
        <span
          style={{
            width: 10,
            height: 10,
            flex: 'none',
            boxSizing: 'border-box',
            borderRadius: RADIUS.pill,
            border: `2px solid ${dot === 'open' ? 'var(--border)' : color}`,
            background: dot === 'done' || isNow ? color : 'var(--surface)',
          }}
        />
        <span style={{ width: 2, flex: 1, background: last ? 'transparent' : rail }} />
      </span>
      <div style={{ flex: 1, minWidth: 0, padding: `${SPACE.xs}px 0` }}>{children}</div>
    </div>
  );
}

// A run of one or more hours holding the same text, or the empty hour
// you are in (or one you opened from an open run) waiting to be written.
function SpanCard({
  slots,
  isNow,
  color,
  setMany,
  focusOnMount,
  onSplit,
}: {
  slots: HourSlot[];
  isNow: boolean;
  color: string;
  setMany: SetMany;
  // Present on a span of two or more hours: breaks it into one row per
  // hour, so one of them can be rewritten without rewriting the rest.
  onSplit?: () => void;
  // Set on an hour the user just opened from an open run: they pressed
  // "Plan", so the next keystroke belongs in this hour's input.
  focusOnMount?: boolean;
}) {
  const L = useL();
  const hours = slots.map((s) => s.hour);
  const first = slots[0];
  const [text, setText] = useState(first.text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setText(first.text), [first.text]);
  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  const filled = text.trim().length > 0;
  const done = filled && slots.every((s) => s.done);
  const repeat = filled && slots.every((s) => s.repeat);
  const span = slots.length;
  const endHour = (hours[hours.length - 1] + 1) % 24;

  const save = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMany(hours, { text: v }), 500);
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.sm,
        minHeight: span > 1 ? 40 + (span - 1) * 16 : 40,
        padding: `${SPACE.xs}px ${SPACE.sm}px`,
        boxSizing: 'border-box',
        borderRadius: RADIUS.card,
        overflow: 'hidden',
        border: isNow ? `1px solid ${color}` : filled ? '1px solid var(--border)' : '1px dashed var(--border)',
        background: isNow
          ? `color-mix(in srgb, ${color} 7%, var(--surface))`
          : done
            ? 'var(--surface-2, var(--surface))'
            : 'var(--surface)',
      }}
    >
      {/* Nothing to tick on an empty hour, so the control is genuinely
          inactive rather than merely styled as such. */}
      <button
        onClick={() => setMany(hours, { done: !done })}
        disabled={!filled}
        aria-pressed={done}
        aria-label={done ? 'Mark not done' : 'Mark done'}
        title={filled ? (done ? 'Mark not done' : 'Mark done') : ''}
        style={{
          width: 24,
          height: 24,
          flex: 'none',
          padding: 0,
          boxSizing: 'border-box',
          borderRadius: RADIUS.pill,
          border: `2px solid ${done ? 'var(--success)' : filled ? color : 'var(--border)'}`,
          background: done ? 'var(--success)' : 'transparent',
          color: 'var(--on-success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: filled ? 'pointer' : 'default',
          opacity: filled ? 1 : 0.5,
        }}
      >
        {done && <Check size={14} strokeWidth={3} />}
      </button>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE.hair }}>
        <input
          aria-label={span > 1 ? `What ${hourLabel(hours[0])} to ${hourLabel(endHour)} is for` : 'What this hour is for'}
          ref={inputRef}
          value={text}
          // Only the hour you are in (or one you just opened) asks the
          // question; a column of prompts would be the form legacy
          // already removed.
          placeholder={isNow || focusOnMount ? L('What are you doing this hour?', 'এই ঘণ্টায় কী?') : ''}
          onChange={(e) => {
            setText(e.target.value);
            save(e.target.value);
          }}
          onBlur={() => {
            if (timer.current) clearTimeout(timer.current);
            if (text !== first.text) setMany(hours, { text });
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{
            width: '100%',
            border: 'none',
            background: 'transparent',
            padding: 0,
            height: 24,
            fontSize: isNow ? 14 : 13,
            fontWeight: filled ? (isNow ? 700 : 600) : 400,
            color: done ? 'var(--text-muted)' : 'var(--text)',
            textDecoration: done ? 'line-through' : undefined,
          }}
        />
        {isNow ? (
          <NowMeta spanStart={hours[0]} spanLen={span} color={color} />
        ) : (
          span > 1 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {hourLabel(hours[0])} – {hourLabel(endHour)}
            </span>
          )
        )}
      </div>

      {span > 1 && filled && (
        <span
          style={{
            flex: 'none',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            borderRadius: RADIUS.pill,
            padding: `0 ${SPACE.sm}px`,
          }}
        >
          {span}h
        </span>
      )}

      {onSplit && span > 1 && filled && (
        <button
          onClick={onSplit}
          aria-label={`Split ${hourLabel(hours[0])} to ${hourLabel(endHour)} into separate hours`}
          title="Split into separate hours, to change one of them"
          className="btn-ghost"
          style={{
            width: 24,
            height: 24,
            flex: 'none',
            padding: 0,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Scissors size={14} />
        </button>
      )}

      {/* Repeat until finished. Not a habit and not a schedule: the day
          starts fresh, and this one entry keeps coming back at its hour
          until the morning after you tick it. The control states which
          mode it is in, because "off" is the normal case. */}
      <button
        onClick={() => setMany(hours, { repeat: !repeat })}
        disabled={!filled}
        aria-pressed={repeat}
        aria-label={repeat ? 'Stop repeating' : 'Repeat every day until finished'}
        title={repeat ? 'Repeats every day until you finish it — click to stop' : 'Keep this on every day until it is finished'}
        className="btn-ghost"
        style={{
          width: 24,
          height: 24,
          flex: 'none',
          padding: 0,
          color: repeat ? color : 'var(--text-faint)',
          visibility: filled ? 'visible' : 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Repeat size={14} />
      </button>
      <button
        onClick={() => setMany(hours, { text: '', done: false, repeat: false })}
        aria-label={span > 1 ? 'Clear these hours' : 'Clear this hour'}
        title={span > 1 ? 'Clear these hours' : 'Clear this hour'}
        className="btn-ghost"
        style={{
          width: 24,
          height: 24,
          flex: 'none',
          padding: 0,
          color: 'var(--text-muted)',
          visibility: filled ? 'visible' : 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function OpenRun({ hours, onOpen }: { hours: number[]; onOpen: () => void }) {
  const L = useL();
  const end = (hours[hours.length - 1] + 1) % 24;
  return (
    <button
      onClick={onOpen}
      className="hover-tint"
      style={{
        width: '100%',
        minHeight: 40,
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.sm,
        padding: `0 ${SPACE.sm}px`,
        border: '1px dashed var(--border)',
        borderRadius: RADIUS.card,
        background: 'transparent',
        color: 'var(--text-muted)',
        fontSize: 12,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <Plus size={14} />
      {hours.length > 1
        ? L(`${hours.length} open hours · until ${hourLabel(end)} · Plan`, `${hours.length} ঘণ্টা খালি · ${hourLabel(end)} পর্যন্ত · প্ল্যান`)
        : L('Open hour · Plan', 'খালি ঘণ্টা · প্ল্যান')}
    </button>
  );
}

function BlockCard({
  block,
  isNowBlock,
  nowHour,
  shown,
  onToggle,
  setMany,
}: {
  block: HourBlock;
  isNowBlock: boolean;
  nowHour: number | null;
  shown: boolean;
  onToggle: () => void;
  setMany: SetMany;
}) {
  const lang = useLang();
  const L = useL();
  const color = `var(--phase-${block.key})`;
  // Open runs the user pressed, keyed by their first hour. Cleared when
  // the block closes, so a block reopens in its folded state.
  const [opened, setOpened] = useState<Set<number>>(new Set());
  // While an input inside is focused the run boundaries are frozen:
  // typing text that matches a neighbour would otherwise merge the two
  // mid-keystroke and unmount the input you are typing in.
  const [editing, setEditing] = useState(false);
  const frozen = useRef<number[][] | null>(null);
  const [justOpened, setJustOpened] = useState<number | null>(null);
  // Hours the user split out of a span. Like `opened`, in memory only and
  // cleared when the block closes: a span of identical text is still the
  // natural reading of the plan, and a split is for the edit at hand.
  const [apart, setApart] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!shown) {
      setOpened(new Set());
      setApart(new Set());
    }
  }, [shown]);

  const live = segmentHours(block.hours, nowHour, apart);
  if (!editing || !frozen.current) frozen.current = live;
  const runs = frozen.current;
  const bySlot = new Map(block.hours.map((h) => [h.hour, h]));

  const names: string[] = [];
  for (const h of block.hours) {
    const t = h.text.trim();
    if (t && !names.includes(t)) names.push(t);
  }
  const startH = block.hours[0]?.hour ?? 0;
  const endH = ((block.hours[block.hours.length - 1]?.hour ?? 0) + 1) % 24;
  const allDone = block.planned > 0 && block.done === block.planned;

  // Items to draw: a written span, the empty current hour, each hour of
  // an open run the user expanded, or a folded open run.
  type Item = { key: string; hours: number[]; kind: 'span' | 'open' };
  const items: Item[] = [];
  for (const run of runs) {
    const slots = run.map((h) => bySlot.get(h)).filter((s): s is HourSlot => !!s);
    if (slots.length === 0) continue;
    const empty = slots[0].text.trim() === '';
    const isNowRun = nowHour !== null && run.includes(nowHour);
    if (!empty || isNowRun) items.push({ key: `s${run[0]}`, hours: run, kind: 'span' });
    else if (opened.has(run[0])) run.forEach((h) => items.push({ key: `s${h}`, hours: [h], kind: 'span' }));
    else items.push({ key: `o${run[0]}`, hours: run, kind: 'open' });
  }

  return (
    <div
      style={{
        border: `1px solid ${isNowBlock ? color : 'var(--border)'}`,
        borderRadius: RADIUS.card,
        background: 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={shown}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: SPACE.sm,
          padding: `${SPACE.sm}px ${SPACE.md}px`,
          border: 'none',
          background: isNowBlock ? `color-mix(in srgb, ${color} 7%, var(--surface))` : 'transparent',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        <span aria-hidden style={{ width: 4, height: 32, flex: 'none', borderRadius: RADIUS.pill, background: color }} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE.hair }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color }}>
              {(lang === 'bn' ? PHASE_LABELS_BN[block.key] ?? block.name : block.name).toUpperCase()}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {hourLabel(startH)} – {hourLabel(endH)}
            </span>
            {isNowBlock && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: 'var(--surface)',
                  background: color,
                  padding: `0 ${SPACE.sm}px`,
                  borderRadius: RADIUS.pill,
                }}
              >
                {L('NOW', 'এখন')}
              </span>
            )}
          </span>
          {!shown && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {names.length ? names.join(' · ') : L('Nothing planned', 'কিছু প্ল্যান নেই')}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: allDone ? 'var(--success)' : 'var(--text-muted)', flex: 'none' }}>
          {block.planned > 0 ? `${block.done}/${block.planned}` : '—'}
        </span>
        <span aria-hidden style={{ width: 48, height: 4, flex: 'none', borderRadius: RADIUS.pill, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}>
          <span
            style={{
              display: 'block',
              height: '100%',
              width: block.planned > 0 ? `${(block.done / block.planned) * 100}%` : 0,
              background: color,
            }}
          />
        </span>
        <span
          aria-hidden
          style={{
            flex: 'none',
            color: 'var(--text-muted)',
            display: 'flex',
            transition: 'transform 200ms ease-out',
            transform: shown ? 'rotate(180deg)' : 'none',
          }}
        >
          <ChevronDown size={16} />
        </span>
      </button>

      {shown && (
        <div
          style={{ padding: `${SPACE.xs}px ${SPACE.md}px ${SPACE.md}px` }}
          // Only a focused TEXT INPUT freezes the rows. A button (split,
          // tick, repeat) must not: pressing split has to regroup at once.
          onFocus={(e) => setEditing(e.target instanceof HTMLInputElement)}
          onBlur={(e) => {
            const next = e.relatedTarget;
            if (!(next instanceof HTMLInputElement && e.currentTarget.contains(next))) setEditing(false);
          }}
        >
          {items.map((it, i) => {
            const slots = it.hours.map((h) => bySlot.get(h)!).filter(Boolean);
            const isNow = nowHour !== null && it.hours.includes(nowHour);
            const filled = slots[0].text.trim() !== '';
            const done = filled && slots.every((s) => s.done);
            return (
              <TimelineRow
                key={it.key}
                hour={it.hours[0]}
                color={color}
                first={i === 0}
                last={i === items.length - 1}
                isNow={isNow}
                dot={done ? 'done' : filled ? 'planned' : 'open'}
              >
                {it.kind === 'open' ? (
                  <OpenRun
                    hours={it.hours}
                    onOpen={() => {
                      setOpened((o) => new Set(o).add(it.hours[0]));
                      setJustOpened(it.hours[0]);
                    }}
                  />
                ) : (
                  <SpanCard
                    slots={slots}
                    isNow={isNow}
                    color={color}
                    setMany={setMany}
                    focusOnMount={justOpened === it.hours[0]}
                    onSplit={
                      it.hours.length > 1
                        ? () =>
                            setApart((a) => {
                              const n = new Set(a);
                              it.hours.forEach((h) => n.add(h));
                              return n;
                            })
                        : undefined
                    }
                  />
                )}
              </TimelineRow>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The line of numbers and the 24-cell ribbon above the blocks.
function DayOverview({ plan, nowHour, nowMin }: { plan: HourPlanData; nowHour: number | null; nowMin: number }) {
  const L = useL();
  const cells = plan.blocks.flatMap((b) => b.hours.map((h) => ({ slot: h, key: b.key })));
  const nowBlock = nowHour === null ? undefined : plan.blocks.find((b) => b.hours.some((h) => h.hour === nowHour));
  let leftInBlock: number | null = null;
  if (nowBlock && nowHour !== null) {
    const idx = nowBlock.hours.findIndex((h) => h.hour === nowHour);
    leftInBlock = (nowBlock.hours.length - idx) * 60 - nowMin;
  }
  const firstOf = new Set(plan.blocks.map((b) => b.hours[0]?.hour));

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: RADIUS.card,
        background: 'var(--surface)',
        padding: SPACE.md,
        marginBottom: SPACE.sm,
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
        <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {plan.total_done}
          <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>/{plan.total_planned}</span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{L('planned hours done', 'প্ল্যান করা ঘণ্টা শেষ')}</span>
        <span style={{ flex: 1 }} />
        {nowBlock && leftInBlock !== null && (
          <span style={{ fontSize: 12, fontWeight: 700, color: `var(--phase-${nowBlock.key})`, whiteSpace: 'nowrap' }}>
            {L(nowBlock.name, PHASE_LABELS_BN[nowBlock.key] ?? nowBlock.name)} · {fmtMins(Math.max(0, leftInBlock))} {L('left', 'বাকি')}
          </span>
        )}
      </div>
      <div
        role="img"
        aria-label={`The day, hour by hour: ${plan.total_done} of ${plan.total_planned} planned hours done.`}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`, gap: SPACE.hair }}
      >
        {cells.map(({ slot, key }) => {
          const c = `var(--phase-${key})`;
          const filled = slot.text.trim() !== '';
          const isNow = slot.hour === nowHour;
          return (
            <span
              key={slot.hour}
              title={`${hourLabel(slot.hour)} · ${filled ? slot.text + (slot.done ? ' ✓' : '') : 'open'}`}
              style={{
                height: 24,
                borderRadius: RADIUS.control,
                background: slot.done && filled ? c : filled ? `color-mix(in srgb, ${c} 45%, var(--surface))` : `color-mix(in srgb, ${c} 12%, var(--surface))`,
                outline: isNow ? '2px solid var(--text)' : undefined,
                outlineOffset: 1,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`, gap: SPACE.hair }}>
        {cells.map(({ slot }) => (
          <span key={slot.hour} style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'visible' }}>
            {firstOf.has(slot.hour) ? hourLabel(slot.hour).replace(' ', '').toLowerCase() : ''}
          </span>
        ))}
      </div>
      {/* Words, not swatches: the cells take their block's colour, so a
          grey sample square matched none of them. What carries the
          meaning is the strength of the colour, and that is what this
          line says. */}
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {L('Darker = done · lighter = planned · faint = open', 'গাঢ় = শেষ · মাঝারি = প্ল্যান · হালকা = খালি')}
      </span>
    </div>
  );
}

export default function HourPlanTab({
  refreshSignal = 0,
  onChanged,
  date,
}: {
  refreshSignal?: number;
  onChanged?: () => void;
  // Defaults to today when absent. Panel3's HoursAccordion passes a
  // real value when the day picker or a WEEKLY/MONTHLY/YEARLY calendar
  // dot jumps here to another date.
  date?: string;
}) {
  // In memory, deliberately not persisted. Legacy's reason: "auto-collapse
  // when its time zone isn't running" only stays true if the automatic
  // answer is what you get by default — saved to disk, one afternoon of
  // opening Morning to plan tomorrow would pin it open forever.
  const L = useL();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => new Date());
  const nowHourRaw = now.getHours();
  const day = date ?? todayIso();
  const viewingToday = day === todayIso();
  const nowHour = viewingToday ? nowHourRaw : null;

  const { data: plan, loadError, refresh } = useFetchState<HourPlanData | null>(() => hoursApi.get(day), [day], null);

  useEffect(() => {
    if (refreshSignal === 0) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // The minute matters for "Xh YYm left"; the hour for which row is live.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowHourRaw]);

  if (loadError) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          fontSize: 12,
          color: 'var(--danger)',
          padding: '8px 0',
        }}
      >
        <span>{L("Couldn't load — check the app is connected.", 'লোড হয়নি — অ্যাপ সংযুক্ত আছে কিনা দেখুন।')}</span>
        <button className="btn-ghost" style={{ fontSize: 12, flex: 'none' }} onClick={refresh}>
          {L('Retry', 'আবার চেষ্টা')}
        </button>
      </div>
    );
  }
  if (!plan) return <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{L('Loading…', 'লোড হচ্ছে…')}</div>;

  const setMany: SetMany = (hours, patch) =>
    Promise.all(hours.map((h) => hoursApi.set(day, h, patch))).then(() => {
      refresh();
      onChanged?.();
    });

  return (
    <div>
      <DayOverview plan={plan} nowHour={nowHour} nowMin={now.getMinutes()} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
        {plan.blocks.map((b) => {
          const isNowBlock = viewingToday && b.key === plan.current_block;
          const shown = open[b.key] ?? isNowBlock;
          return (
            <BlockCard
              key={b.key}
              block={b}
              isNowBlock={isNowBlock}
              nowHour={nowHour}
              shown={shown}
              onToggle={() => setOpen((o) => ({ ...o, [b.key]: !(o[b.key] ?? isNowBlock) }))}
              setMany={setMany}
            />
          );
        })}
      </div>
    </div>
  );
}

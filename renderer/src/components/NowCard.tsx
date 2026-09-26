import { useEffect, useRef, useState } from 'react';
import { useL } from '../i18n';
import { Check, SkipForward, Undo2 } from 'lucide-react';
import { HourSlot, Project, STRIKE_MAX, Settings, Task, hoursApi, nowApi, projectsApi, settingsApi, tasksApi } from '../services/api';
import { currentPhaseInfo } from './DayPhaseBars';
import { PROGRESS_TRACK_SOFT, RADIUS, SPACE } from '../spacing';

function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatHMS(secs: number): string {
  const total = Math.max(0, Math.round(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function fmtEst(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// One thing NEXT can switch to: a task of today's three, or an hour of
// today's plan that has not been turned into a task yet.
type NextItem = { kind: 'task'; task: Task } | { kind: 'hour'; slot: HourSlot };

// NEXT's order — today's three first (MIT at the top), then the hour
// plan from the hour you are in onward, then the hours already behind
// you that are still open. An hour whose task is already one of the
// three is listed once, as the task.
function buildQueue(struck: Task[], slots: HourSlot[], hourNow: number): NextItem[] {
  const three = [...struck].filter((t) => !t.done).sort((a, b) => Number(b.mit) - Number(a.mit));
  const taken = new Set(three.map((t) => t.hour_slot_id).filter((x) => x !== null));
  const open = slots.filter((x) => x.text.trim() && !x.done && !(x.id !== null && taken.has(x.id)));
  const ahead = open.filter((x) => x.hour >= hourNow).sort((a, b) => a.hour - b.hour);
  const behind = open.filter((x) => x.hour < hourNow).sort((a, b) => a.hour - b.hour);
  return [...three.map((task) => ({ kind: 'task' as const, task })), ...[...ahead, ...behind].map((slot) => ({ kind: 'hour' as const, slot }))];
}

const PAUSED_KEY = 'now-paused';

function isRunning(task: Task): boolean {
  return task.sessions.length > 0 && task.sessions[task.sessions.length - 1].end === null;
}

export default function NowCard({
  refreshSignal,
  onChanged,
  onGoToMit,
}: {
  refreshSignal: number;
  onChanged: () => void;
  onGoToMit: () => void;
}) {
  const L = useL();
  const [task, setTask] = useState<Task | null>(null);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [displaySecs, setDisplaySecs] = useState(0);
  const [struckCount, setStruckCount] = useState(0);
  // What you wrote in the hour you are in, if anything.
  const [thisHour, setThisHour] = useState<HourSlot | null>(null);
  const [hour, setHour] = useState(new Date().getHours());
  const [settings, setSettings] = useState<Settings | null>(null);
  // The next thing in today's hour plan after this hour, and the first
  // open task of today's three — the two answers to "what after this /
  // what do I start" the card can give without leaving it.
  const [nextSlot, setNextSlot] = useState<HourSlot | null>(null);
  const [firstOpen, setFirstOpen] = useState<Task | null>(null);
  const [queue, setQueue] = useState<NextItem[]>([]);
  // The task NEXT switched away from, so it can be picked up again.
  const [paused, setPaused] = useState<{ id: number; text: string } | null>(() => {
    try {
      const v = localStorage.getItem(PAUSED_KEY);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  });
  // Read through a ref inside refresh(), which the effects below call
  // without re-running whenever this changes.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const rememberPaused = (p: { id: number; text: string } | null) => {
    setPaused(p);
    try {
      if (p) localStorage.setItem(PAUSED_KEY, JSON.stringify(p));
      else localStorage.removeItem(PAUSED_KEY);
    } catch {
      /* remembering it is a convenience only */
    }
  };
  useEffect(() => {
    settingsApi.get().then(setSettings).catch(() => setSettings(null));
  }, []);

  const refresh = () => {
    Promise.all([hoursApi.get(todayIso()).catch(() => null), tasksApi.listStrike().catch(() => [] as Task[])]).then(([plan, struck]) => {
      const h = new Date().getHours();
      const slots = plan ? plan.blocks.flatMap((b) => b.hours) : [];
      const later = slots.filter((x) => x.hour > h && x.text.trim() && !x.done).sort((a, b) => a.hour - b.hour);
      setNextSlot(later[0] ?? null);
      setFirstOpen([...struck].sort((a, b) => Number(b.mit) - Number(a.mit)).find((t) => !t.done) ?? null);
      setQueue(buildQueue(struck, slots, h));
    });
    // A paused task that has since been finished (or deleted) has
    // nothing left to resume.
    const p = pausedRef.current;
    if (p) {
      tasksApi
        .list('focus', 'all')
        .then((all) => {
          const t = all.find((x) => x.id === p.id);
          if (!t || t.done) rememberPaused(null);
        })
        .catch(() => {});
    }
    return nowApi.get().then((t) => {
      setTask(t);
      // A task can reach NOW without being one of today's three — press
      // play on an hour and it lands here (commit f9958f5). Correct, and
      // unreadable: the card said "ebay" while the STRIKE card directly
      // below it said nothing was committed, so the screen contradicted
      // itself in two adjacent cards. NOW now says where its task came
      // from, and offers the one gesture that resolves the difference.
      // Only the uncommitted case pays for the extra fetch.
      if (t && !t.strike) tasksApi.listStrike().then((l) => setStruckCount(l.length));
      // Only the empty card needs this, so only the empty card pays for
      // it: a running NOW never renders the chooser.
      if (t === null) {
        // Nothing struck and open — the server derives NOW from exactly
        // that, so reaching here means the committed list is empty or
        // finished. An earlier version of this card also offered "start
        // the one struck task" and "pick from your N": both were dead
        // code, because a struck open task makes /api/now non-null and
        // this branch never runs at all.
        //
        // HOURS is where this user actually plans the day, so an empty
        // NOW asks it first: if you wrote something in the hour you are
        // standing in, that IS the answer to "what now" and the card
        // should not send you to another tab to find it.
        hoursApi.get(todayIso()).then((plan) => {
          const h = new Date().getHours();
          const slot = plan.blocks.flatMap((b) => b.hours).find((s) => s.hour === h);
          setThisHour(slot && slot.text.trim() && !slot.done ? slot : null);
        });
      }
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  useEffect(() => {
    projectsApi.order().then((order) => {
      const map: Record<string, Project> = {};
      order.forEach((e) => (map[e.project.key] = e.project));
      setProjects(map);
    });
  }, []);

  const running = task ? isRunning(task) : false;
  const over = !!task && task.est > 0 && displaySecs > task.est * 60;

  // Local 1-per-second tick while running, re-anchored to the server's
  // own `secs` whenever it changes (a fresh fetch after start/stop) —
  // avoids drifting from the real credited time.
  useEffect(() => {
    if (!task) return;
    setDisplaySecs(task.secs);
    if (!running) return;
    const id = setInterval(() => setDisplaySecs((d) => d + 1), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task?.secs, running]);

  // Both actions change fields the Focus list itself renders (strike,
  // done, sessions/secs) — tell TaskList to refetch too, or its row for
  // this exact task goes stale the moment NOW changes it.
  // Crossing into a new hour changes what this card should offer, and
  // the cost of noticing is one comparison a minute.
  useEffect(() => {
    const id = setInterval(() => {
      const h = new Date().getHours();
      setHour((prev) => (prev === h ? prev : h));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour]);

  const phase = settings ? currentPhaseInfo(settings, new Date()) : null;
  const phaseColor = phase?.color ?? 'var(--accent)';
  const fmtHour = (h: number) => `${h % 12 || 12}${h < 12 ? ' AM' : ' PM'}`;
  // What NEXT would switch to: the item after the current one in the
  // queue, wrapping round, so pressing it repeatedly walks the whole day
  // and comes back to where you started.
  const here = task
    ? queue.findIndex((it) => (it.kind === 'task' ? it.task.id === task.id : it.slot.id !== null && it.slot.id === task.hour_slot_id))
    : -1;
  const others = queue.filter((_, i) => i !== here);
  const upNext: NextItem | null = others.length ? (here >= 0 ? queue[(here + 1) % queue.length] : others[0]) : null;
  const itemText = (it: NextItem) => (it.kind === 'task' ? it.task.text : it.slot.text);
  const itemTag = (it: NextItem) => (it.kind === 'task' ? (it.task.mit ? 'MIT' : L("today's 3", 'আজকের ৩')) : fmtHour(it.slot.hour));
  const nextLine = upNext
    ? L(`Next: ${itemText(upNext)} · ${itemTag(upNext)}`, `পরে: ${itemText(upNext)} · ${itemTag(upNext)}`)
    : nextSlot
      ? L(`Next: ${nextSlot.text} · ${fmtHour(nextSlot.hour)}`, `পরে: ${nextSlot.text} · ${fmtHour(nextSlot.hour)}`)
      : null;
  const showPaused = paused && (!task || task.id !== paused.id) ? paused : null;

  const toggleRun = () => nowApi.toggleRun().then(() => { refresh(); onChanged(); });
  const complete = () => nowApi.complete().then(() => { refresh(); onChanged(); });
  const startHour = (h: number) =>
    nowApi.startHour(todayIso(), h).then(() => { refresh(); onChanged(); });
  // NEXT: leave this task as it is (paused, not done) and start the
  // next one. The one left behind is remembered so it can be resumed.
  const goNext = () => {
    if (!upNext) return;
    if (task) rememberPaused({ id: task.id, text: task.text });
    const go =
      upNext.kind === 'task'
        ? nowApi.setNow(upNext.task.id).then(() => nowApi.toggleRun())
        : nowApi.startHour(todayIso(), upNext.slot.hour);
    go.then(() => {
      refresh();
      onChanged();
    });
  };
  // RESUME swaps back: the paused task becomes NOW again and runs, and
  // the one it replaces is remembered in its place.
  const resume = () => {
    if (!showPaused) return;
    const back = showPaused.id;
    rememberPaused(task ? { id: task.id, text: task.text } : null);
    nowApi
      .setNow(back)
      .then(() => nowApi.toggleRun())
      .then(() => {
        refresh();
        onChanged();
      });
  };
  const commit = () => {
    if (!task) return;
    tasksApi.toggleStrike(task.id).then(() => { refresh(); onChanged(); });
  };

  return (
    <div
      className="card-elevated"
      style={{
        border: `${task ? 2 : 1}px solid ${task ? phaseColor : 'var(--border)'}`,
        borderLeft: `4px solid ${phaseColor}`,
        borderRadius: RADIUS.card,
        padding: SPACE.md,
        marginBottom: SPACE.lg,
        boxShadow: 'var(--shadow-sm)',
        // This card is the one place the app names as its own strongest
        // execution element (see comments below) — every other card on
        // this panel (Deep Work, Mindset) shares the same plain
        // var(--surface), which left NOW no more visually weighted than
        // a chart. A faint accent wash gives it a distinct ground
        // without introducing a new color (visual redesign pass,
        // 2026-09-20 — architecture/state untouched).
        background: task ? `color-mix(in srgb, ${phaseColor} 5%, var(--surface))` : 'var(--surface)',
      }}
    >
      {task && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: phaseColor, letterSpacing: 1 }}>{L('NOW', 'এখন')}</span>
          {phase && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{phase.label}</span>}
        </div>
      )}
      {task ? (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, margin: '4px 0' }}>{task.text}</div>
          {/* One quiet meta line: where this task came from, and — when
              it is not one of the three — the gesture that makes it one.
              Both facts belong on the same line because they are the
              same sentence: "this came from your hour plan, and it is
              not committed yet". */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', minHeight: 20 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.project ? projects[task.project]?.name || task.project : null}
              {task.project && !task.strike ? ' · ' : null}
              {!task.strike
                ? task.hour_slot_id !== null
                  ? L("from this hour's plan", 'এই ঘণ্টার প্ল্যান থেকে')
                  : L("not in today's 3", 'আজকের ৩-এ নেই')
                : null}
            </span>
            {!task.strike && struckCount < STRIKE_MAX && (
              <button
                onClick={commit}
                className="btn-ghost"
                title="Add this to today's three"
                style={{ fontSize: 12, height: 24, padding: '0 8px', flex: 'none' }}
              >
                {L('+ STRIKE', '+ স্ট্রাইক')}
              </button>
            )}
          </div>
          {/* Timer and its two actions on ONE row, and the time-box
              under them as a bar. Stacked (a 30px timer line, then a
              full-width button row) the card took a third of the column
              above the tabs; on one row it answers the same three
              questions — how long, and stop or finish — in half. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.sm }}>
            <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {formatHMS(displaySecs)}
            </span>
            {task.est > 0 && (
              <span style={{ fontSize: 12, color: over ? 'var(--danger)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {L(`of ~${fmtEst(task.est)}`, `~${fmtEst(task.est)}-এর`)}
              </span>
            )}
            <span style={{ flex: 1 }} />
            {/* One primary action per card, and this is it. COMPLETE
                sits beside it as an ordinary button: on a timer reading
                00:00:00 it is the rarer of the two. */}
            <button onClick={toggleRun} className="btn-primary" style={{ height: 32, padding: `0 ${SPACE.md}px`, flex: 'none' }}>
              {running ? `⏸ ${L('PAUSE', 'বিরতি')}` : `▶ ${L('START', 'শুরু')}`}
            </button>
            {upNext && (
              <button
                onClick={goNext}
                title={L(`Leave this for now and start: ${itemText(upNext)}`, `এটা রেখে শুরু করুন: ${itemText(upNext)}`)}
                style={{ height: 32, padding: `0 ${SPACE.md}px`, display: 'flex', alignItems: 'center', gap: SPACE.xs, flex: 'none' }}
              >
                <SkipForward size={14} /> {L('NEXT', 'পরেরটা')}
              </button>
            )}
            <button
              onClick={complete}
              style={{ height: 32, padding: `0 ${SPACE.md}px`, display: 'flex', alignItems: 'center', gap: SPACE.xs, flex: 'none' }}
            >
              <Check size={14} /> {L('COMPLETE', 'সম্পন্ন')}
            </button>
          </div>
          {task.est > 0 && (
            <div
              role="progressbar"
              aria-label="Time used of the time-box"
              aria-valuemin={0}
              aria-valuemax={task.est * 60}
              aria-valuenow={Math.min(displaySecs, task.est * 60)}
              style={{ height: 4, marginTop: SPACE.sm, borderRadius: RADIUS.pill, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, (displaySecs / (task.est * 60)) * 100)}%`,
                  background: over ? 'var(--danger)' : 'var(--accent)',
                }}
              />
            </div>
          )}
          {nextLine && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: SPACE.sm, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nextLine}
            </div>
          )}
          {showPaused && (
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.xs, fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {L('Paused', 'থামানো')}: {showPaused.text}
              </span>
              <button onClick={resume} title={L('Go back to this task', 'এই কাজে ফিরে যান')} style={{ fontSize: 12, height: 24, padding: `0 ${SPACE.sm}px`, flex: 'none', display: 'flex', alignItems: 'center', gap: SPACE.xs }}>
                <Undo2 size={12} /> {L('Resume', 'ফিরে যান')}
              </button>
            </div>
          )}
        </>
      ) : (
        // The empty card used to be 61px of instruction with nothing to
        // press: "Pick from MIT, or + STRIKE a task" told you what to do
        // and then made you go do it somewhere else. On the screen whose
        // whole argument is one task and one gesture, the card that
        // opens the day offered no gesture at all.
        //
        // It is one line and one control now. Something written in the
        // hour you are standing in IS "what now" — HOURS is where this
        // day gets planned, and crossing to another tab to start what
        // you already wrote is the friction this card exists to remove.
        // Otherwise the control hands you to MIT, where the three get
        // chosen; it does not list them here, because legacy's warning
        // about the review card applies word for word — "two places to
        // look for the same four items".
        //
        // The label shares the row with its control: an empty card holds
        // one thing, and giving that one thing a heading costs a whole
        // line to caption a single button.
        // Idle: the same two tiers as the running card (a caption, then
        // the one thing to do) instead of a single cramped row, so the
        // card keeps its shape whether or not a timer is running. The
        // offer is the hour you planned if there is one, else the step
        // that fills NOW: choosing today's three.
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>{L('NOW', 'এখন')}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {thisHour ? L("Nothing running · this hour's plan", 'কিছু চলছে না · এই ঘণ্টার প্ল্যান') : L('Nothing running', 'কিছু চলছে না')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 16,
                fontWeight: 700,
                color: thisHour ? 'var(--text)' : 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {thisHour ? thisHour.text : firstOpen ? firstOpen.text : L("Choose today's three to start", 'শুরু করতে আজকের তিনটি বাছুন')}
            </span>
            {thisHour ? (
              <button
                onClick={() => startHour(thisHour.hour)}
                title="Start what you planned for this hour"
                className="btn-primary"
                style={{ height: 32, padding: `0 ${SPACE.md}px`, flex: 'none' }}
              >
                ▶ {L('START', 'শুরু')}
              </button>
            ) : firstOpen ? (
              <button
                onClick={() => tasksApi.toggleTimer(firstOpen.id).then(() => { refresh(); onChanged(); })}
                title="Start the first open task of today's three"
                className="btn-primary"
                style={{ height: 32, padding: `0 ${SPACE.md}px`, flex: 'none' }}
              >
                ▶ {L('START', 'শুরু')}
              </button>
            ) : (
              <button
                onClick={onGoToMit}
                title="Commit to up to three tasks for today"
                style={{ height: 32, padding: `0 ${SPACE.md}px`, flex: 'none', cursor: 'pointer' }}
              >
                MIT →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

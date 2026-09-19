import { useEffect, useState } from 'react';
import { useL } from '../i18n';
import { HourSlot, Project, STRIKE_MAX, Task, hoursApi, nowApi, projectsApi, tasksApi } from '../services/api';
import { RADIUS } from '../spacing';

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

function StartButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="btn-primary"
      style={{
        flex: 1,
        minWidth: 0,
        height: 30,
        padding: '0 12px',
        textAlign: 'left',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      ▶ {label}
    </button>
  );
}

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

  const refresh = () =>
    nowApi.get().then((t) => {
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

  const toggleRun = () => nowApi.toggleRun().then(() => { refresh(); onChanged(); });
  const complete = () => nowApi.complete().then(() => { refresh(); onChanged(); });
  const startHour = (h: number) =>
    nowApi.startHour(todayIso(), h).then(() => { refresh(); onChanged(); });
  const commit = () => {
    if (!task) return;
    tasksApi.toggleStrike(task.id).then(() => { refresh(); onChanged(); });
  };

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)',
        borderRadius: RADIUS.card,
        padding: task ? 12 : 10,
        marginBottom: task ? 16 : 10,
        background: 'var(--surface)',
      }}
    >
      {task && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', letterSpacing: 1 }}>{L('NOW', 'এখন')}</div>
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
          <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'monospace', margin: '8px 0' }}>
            {formatHMS(displaySecs)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* One primary action per card, and this is it. COMPLETE
                sits beside it as an ordinary button: on a timer reading
                00:00:00 it is the rarer of the two, and drawing both as
                equals asked you to choose between starting and
                finishing something you have not started. */}
            <button onClick={toggleRun} className="btn-primary" style={{ flex: 1, padding: '8px 0' }}>
              {running ? `⏸ ${L('PAUSE', 'বিরতি')}` : `▶ ${L('START', 'শুরু')}`}
            </button>
            <button onClick={complete} style={{ padding: '8px 12px' }}>
              ✓ {L('COMPLETE', 'সম্পন্ন')}
            </button>
          </div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-faint)', letterSpacing: 1, flex: 'none' }}>
            {L('NOW', 'এখন')}
          </span>
          {thisHour ? (
            <StartButton
              label={thisHour.text}
              title="Start what you planned for this hour"
              onClick={() => startHour(thisHour.hour)}
            />
          ) : (
            <button
              onClick={onGoToMit}
              title="Commit to up to three tasks for today"
              style={{ flex: 1, height: 30, padding: '0 12px', textAlign: 'left', cursor: 'pointer' }}
            >
              {L("Choose today's 3 →", 'আজকের ৩টি বাছুন →')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

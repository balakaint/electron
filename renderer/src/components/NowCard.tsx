import { useEffect, useState } from 'react';
import { useL } from '../i18n';
import { HourSlot, Project, Task, hoursApi, nowApi, projectsApi, tasksApi } from '../services/api';

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
      style={{
        flex: 1,
        minWidth: 0,
        height: 30,
        padding: '0 10px',
        textAlign: 'left',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontWeight: 'bold',
        background: 'var(--accent)',
        color: 'var(--on-accent)',
        border: 'none',
        cursor: 'pointer',
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
  // What you have already committed to today, for the empty state only.
  const [struck, setStruck] = useState<Task[]>([]);
  // What you wrote in the hour you are in, if anything.
  const [thisHour, setThisHour] = useState<HourSlot | null>(null);
  const [hour, setHour] = useState(new Date().getHours());

  const refresh = () =>
    nowApi.get().then((t) => {
      setTask(t);
      // Only the empty card needs this, so only the empty card pays for
      // it: a running NOW never renders the chooser.
      if (t === null) {
        tasksApi.listStrike().then((all) => setStruck(all.filter((x) => !x.done)));
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
  const startTask = (id: number) =>
    nowApi.setNow(id).then(() => nowApi.toggleRun()).then(() => { refresh(); onChanged(); });
  const startHour = (h: number) =>
    nowApi.startHour(todayIso(), h).then(() => { refresh(); onChanged(); });

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)',
        borderRadius: 8,
        padding: task ? 12 : 10,
        marginBottom: task ? 16 : 10,
        background: 'var(--surface)',
      }}
    >
      {task && (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: 1 }}>{L('NOW', 'এখন')}</div>
      )}
      {task ? (
        <>
          <div style={{ fontSize: 18, fontWeight: 'bold', margin: '4px 0' }}>{task.text}</div>
          {task.project && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{projects[task.project]?.name || task.project}</div>
          )}
          <div style={{ fontSize: 30, fontWeight: 'bold', fontFamily: 'monospace', margin: '6px 0' }}>
            {formatHMS(displaySecs)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={toggleRun} style={{ flex: 1, padding: '8px 0', fontWeight: 'bold' }}>
              {running ? `⏸ ${L('PAUSE', 'বিরতি')}` : `▶ ${L('START', 'শুরু')}`}
            </button>
            <button onClick={complete} style={{ padding: '8px 12px' }}>
              ✓ COMPLETE
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
        // It is one line and one control now, and the control is chosen
        // by where the answer actually is:
        //
        //   1. Something written in the hour you are standing in. That
        //      IS "what now" — HOURS is where this day was planned, and
        //      making you cross to another tab to start what you already
        //      wrote is the friction this whole card exists to remove.
        //   2. Otherwise, exactly one committed task still open: no
        //      decision left, so the button just starts it.
        //   3. Otherwise there IS a decision, and the card hands you to
        //      MIT rather than listing the options here — legacy's
        //      warning about the review card applies word for word,
        //      "two places to look for the same four items".
        //
        // The label shares the row with its control: an empty card holds
        // one thing, and giving that one thing a heading costs a whole
        // line to caption a single button.
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: 1, flex: 'none' }}>
            {L('NOW', 'এখন')}
          </span>
          {thisHour ? (
            <StartButton
              label={thisHour.text}
              title="Start what you planned for this hour"
              onClick={() => startHour(thisHour.hour)}
            />
          ) : struck.length === 1 ? (
            <StartButton
              label={struck[0].text}
              title="Start the one task you committed to"
              onClick={() => startTask(struck[0].id)}
            />
          ) : (
            <button
              onClick={onGoToMit}
              title={
                struck.length > 1
                  ? "Choose which of today's tasks to start"
                  : 'Commit to up to three tasks for today'
              }
              style={{ flex: 1, height: 30, padding: '0 10px', textAlign: 'left', cursor: 'pointer' }}
            >
              {struck.length > 1
                ? L(`Pick from your ${struck.length} →`, `আপনার ${struck.length}টি থেকে বাছুন →`)
                : L("Choose today's 3 →", 'আজকের ৩টি বাছুন →')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

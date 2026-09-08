import { useEffect, useState } from 'react';
import { useL } from '../i18n';
import { Project, Task, nowApi, projectsApi, tasksApi } from '../services/api';

function formatHMS(secs: number): string {
  const total = Math.max(0, Math.round(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
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

  const refresh = () =>
    nowApi.get().then((t) => {
      setTask(t);
      // Only the empty card needs this, so only the empty card pays for
      // it: a running NOW never renders the chooser.
      if (t === null) tasksApi.listStrike().then((all) => setStruck(all.filter((x) => !x.done)));
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
  const toggleRun = () => nowApi.toggleRun().then(() => { refresh(); onChanged(); });
  const complete = () => nowApi.complete().then(() => { refresh(); onChanged(); });
  const startTask = (id: number) =>
    nowApi.setNow(id).then(() => nowApi.toggleRun()).then(() => { refresh(); onChanged(); });

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
        // It is now one line and one control, and which control depends
        // on whether there is a decision left to make. With exactly one
        // task committed and open there is none — starting it is the
        // only thing "pick one" could mean, so the button just starts
        // it. With two or three there IS a choice, and the card sends
        // you to MIT rather than listing them: legacy's own warning
        // about the review card applies here word for word — "two
        // places to look for the same four items".
        // The label shares the row with its control rather than sitting
        // on a line of its own: an empty card has one thing in it, and
        // giving that one thing a heading costs a whole line to caption
        // a single button.
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: 1, flex: 'none' }}>
            {L('NOW', 'এখন')}
          </span>
          {struck.length === 1 ? (
            <button
              onClick={() => startTask(struck[0].id)}
              title="Start the one task you committed to"
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
              ▶ {struck[0].text}
            </button>
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

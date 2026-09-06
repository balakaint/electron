import { useEffect, useState } from 'react';
import { Project, Task, nowApi, projectsApi } from '../services/api';

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

export default function NowCard({ refreshSignal, onChanged }: { refreshSignal: number; onChanged: () => void }) {
  const [task, setTask] = useState<Task | null>(null);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [displaySecs, setDisplaySecs] = useState(0);

  const refresh = () => nowApi.get().then(setTask);

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

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        background: 'var(--surface)',
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 1 }}>NOW</div>
      {task ? (
        <>
          <div style={{ fontSize: 18, fontWeight: 'bold', margin: '4px 0' }}>{task.text}</div>
          {task.project && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>{projects[task.project]?.name || task.project}</div>
          )}
          <div style={{ fontSize: 30, fontWeight: 'bold', fontFamily: 'monospace', margin: '6px 0' }}>
            {formatHMS(displaySecs)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={toggleRun} style={{ flex: 1, padding: '8px 0', fontWeight: 'bold' }}>
              {running ? '⏸ PAUSE' : '▶ START'}
            </button>
            <button onClick={complete} style={{ padding: '8px 12px' }}>
              ✓ COMPLETE
            </button>
          </div>
        </>
      ) : (
        <p style={{ opacity: 0.6, fontSize: 13, margin: '8px 0 0' }}>Pick from MIT, or + STRIKE a task</p>
      )}
    </div>
  );
}

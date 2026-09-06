import { useEffect, useState } from 'react';
import {
  ActivityEntry,
  CirclePerson,
  Project,
  ProjectKey,
  ProjectOrderEntry,
  STRIKE_MAX,
  Subtask,
  Task,
  TodayProgress,
  circleApi,
  projectsApi,
  tasksApi,
} from '../services/api';
import BusinessAnalysisCanvas from './BusinessAnalysisCanvas';

function formatSecs(secs: number): string {
  const mins = Math.round(secs / 60);
  return `${mins}m`;
}

// Matches the legacy app's _CIRCLE_CADENCES exactly.
const CADENCE_PRESETS = [1, 3, 7, 14, 30];

function nextCadence(current: number): number {
  const i = CADENCE_PRESETS.indexOf(current);
  // Falls back to the default rather than erroring when the stored
  // value isn't one of the presets (matches legacy's own fallback).
  return i === -1 ? 7 : CADENCE_PRESETS[(i + 1) % CADENCE_PRESETS.length];
}

function ProjectCard({
  entry,
  focusTasks,
  onChanged,
  onOpenAnalysis,
}: {
  entry: ProjectOrderEntry;
  focusTasks: Task[];
  onChanged: () => void;
  onOpenAnalysis: (key: ProjectKey) => void;
}) {
  const { number, project } = entry;
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [people, setPeople] = useState<CirclePerson[]>([]);
  const [newPerson, setNewPerson] = useState('');
  const [name, setName] = useState(project.name);
  const [strikeFlash, setStrikeFlash] = useState<string | null>(null);

  const key = project.key as ProjectKey;

  const refreshSubtasks = () => projectsApi.listSubtasks(key).then(setSubtasks);
  const refreshActivity = () => projectsApi.activity(key, 30).then(setActivity);
  const refreshPeople = () => circleApi.list(key).then(setPeople);

  useEffect(() => {
    setName(project.name);
    refreshSubtasks();
    refreshActivity();
    refreshPeople();
  }, [project.name, key]);

  const saveName = () => {
    if (name !== project.name) projectsApi.update(key, { name }).then(onChanged);
  };

  const strikeSubtask = (pid: string) => {
    projectsApi
      .strikeSubtask(pid)
      .then(() => onChanged())
      .catch(() => {
        setStrikeFlash(pid);
        setTimeout(() => setStrikeFlash(null), 1500);
      });
  };

  const addSubtask = () => {
    const text = newSubtask.trim();
    if (!text) return;
    projectsApi.addSubtask(key, text).then(() => {
      setNewSubtask('');
      refreshSubtasks();
    });
  };

  const addPerson = () => {
    const nm = newPerson.trim();
    if (!nm) return;
    circleApi.add(key, nm).then(() => {
      setNewPerson('');
      refreshPeople();
    });
  };

  const running = project.running_since !== null;
  const pct = project.target_minutes > 0 ? Math.min(100, Math.round((project.secs_today / (project.target_minutes * 60)) * 100)) : 0;

  return (
    <div
      style={{
        border: `1px solid ${project.accent_color}55`,
        borderRadius: 8,
        marginBottom: 16,
        overflow: 'hidden',
        opacity: project.done_today ? 0.7 : 1,
      }}
    >
      <div style={{ height: 6, background: project.accent_color }} />
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              border: '1px solid #8884',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
            }}
          >
            {number}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder={`PROJECT ${number}`}
            style={{ flex: 1, fontWeight: 'bold', fontSize: 15, border: 'none', background: 'transparent', color: project.accent_color }}
          />
          <button onClick={() => projectsApi.toggleTimer(key).then(onChanged)}>
            {running ? '⏸' : '▶'}
          </button>
          <button onClick={() => onOpenAnalysis(key)} style={{ fontSize: 11 }}>
            Analysis
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12 }}>
          <div style={{ flex: 1, height: 6, background: '#8882', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: project.accent_color }} />
          </div>
          <span>{formatSecs(project.secs_today)} / {project.target_minutes}m</span>
          <button onClick={() => projectsApi.bumpTarget(key, -15).then(onChanged)}>−</button>
          <button onClick={() => projectsApi.bumpTarget(key, 15).then(onChanged)}>+</button>
        </div>

        <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
          {activity.map((a) => (
            <div
              key={a.day}
              title={`${a.day} — ${formatSecs(a.secs)}`}
              onClick={() => projectsApi.mark(key, a.day, !a.worked).then(refreshActivity)}
              style={{
                width: 7,
                height: 14,
                background: a.worked ? project.accent_color : '#8883',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px 0' }}>
          {subtasks.map((s) => {
            const committed = focusTasks.find((t) => t.psrc === s.pid);
            const onToday = committed !== undefined && committed.strike && !committed.done;
            const full = focusTasks.filter((t) => t.strike && !t.done).length >= STRIKE_MAX;
            return (
              <li key={s.pid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '2px 0' }}>
                <button onClick={() => projectsApi.toggleSubtask(s.pid).then(refreshSubtasks)} style={{ width: 18 }}>
                  {s.done ? '✓' : '○'}
                </button>
                <span style={{ flex: 1, textDecoration: s.done ? 'line-through' : 'none' }}>{s.text}</span>
                {!s.done && (
                  <button
                    onClick={() => strikeSubtask(s.pid)}
                    disabled={onToday || (full && !onToday)}
                    title={onToday ? 'Already on today’s list' : 'Commit to today’s 3'}
                    style={{ fontSize: 10, opacity: onToday ? 0.7 : 1, color: onToday ? project.accent_color : undefined }}
                  >
                    {strikeFlash === s.pid ? 'DAY FULL' : onToday ? '✓ ON TODAY' : '+ STRIKE'}
                  </button>
                )}
                <button onClick={() => projectsApi.deleteSubtask(s.pid).then(refreshSubtasks)}>✕</button>
              </li>
            );
          })}
        </ul>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          <input
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
            placeholder="Add subtask…"
            style={{ flex: 1, fontSize: 12, padding: 4 }}
          />
          <button onClick={addSubtask}>+</button>
        </div>

        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>CIRCLE</div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {people.map((p) => (
            <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: p.overdue ? '#c0392b' : '#2D6A4F' }} />
              <span style={{ flex: 1 }}>{p.name}</span>
              <span style={{ opacity: 0.6 }}>{p.gap_days === null ? 'never' : `${p.gap_days}d ago`}</span>
              <button
                onClick={() => circleApi.update(p.id, { cadence_days: nextCadence(p.cadence_days) }).then(refreshPeople)}
                title="How often you want to be in touch — click to change"
                style={{ fontSize: 11, opacity: 0.8 }}
              >
                every {p.cadence_days}d
              </button>
              <button onClick={() => circleApi.markContacted(p.id).then(refreshPeople)}>✓</button>
              <button onClick={() => circleApi.remove(p.id).then(refreshPeople)}>✕</button>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <input
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPerson()}
            placeholder="Add person…"
            style={{ flex: 1, fontSize: 12, padding: 4 }}
          />
          <button onClick={addPerson}>+</button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectDashboard() {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [progress, setProgress] = useState<TodayProgress | null>(null);
  const [analysisKey, setAnalysisKey] = useState<ProjectKey | null>(null);
  const [focusTasks, setFocusTasks] = useState<Task[]>([]);

  const refresh = () => {
    projectsApi.order().then(setOrder);
    projectsApi.todayProgress().then(setProgress);
    // Fetched once here (not per-card) so every "+ STRIKE" chip agrees
    // about which subtasks are already committed and how full today is.
    tasksApi.list('focus').then(setFocusTasks);
  };

  useEffect(refresh, []);

  if (analysisKey) {
    return <BusinessAnalysisCanvas projectKey={analysisKey} onClose={() => setAnalysisKey(null)} />;
  }

  return (
    <div style={{ maxWidth: 520 }}>
      {progress && (
        <div style={{ marginBottom: 16, fontSize: 13, opacity: 0.8 }}>
          Today: {progress.projects_done}/{progress.projects_total} projects at target · {progress.pct}%
          overall
        </div>
      )}
      {order.map((entry) => (
        <ProjectCard
          key={entry.project.key}
          entry={entry}
          focusTasks={focusTasks}
          onChanged={refresh}
          onOpenAnalysis={setAnalysisKey}
        />
      ))}
    </div>
  );
}

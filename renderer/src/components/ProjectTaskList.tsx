import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { ProjectKey, Subtask, projectsApi } from '../services/api';
import { RADIUS } from '../spacing';

// The task list that belongs to ONE project.
//
// It stands in the LIST slot at the bottom of the EXECUTE screen: pick
// a project in the DEEP WORK card above and the list below becomes that
// project's own — start deep work on SHIP SPARE PARTS and what you add
// underneath is filed under SHIP SPARE PARTS, not into a general pile
// you later have to sort by memory. That is the whole point Zahid was
// after: "individual project ki ki kaz ta easy ber korte parbo".
//
// These are the project's own tasks — the same rows the project card in
// panel 2 shows, not a second store — which matters twice over: nothing
// forks, and compact mode (which never shows panel 2) can finally reach
// them at all.
//
// "→ today" promotes a project task into today's focus list, which is
// what the project cards' own + STRIKE does (strikeSubtask); it is the
// bridge between "this is a thing the project needs" and "this is a
// thing I am doing today".
export default function ProjectTaskList({ projectKey, accent, onPromoted }: { projectKey: ProjectKey; accent: string; onPromoted: () => void }) {
  const [items, setItems] = useState<Subtask[] | null>(null);
  const [text, setText] = useState('');

  const load = () => projectsApi.listSubtasks(projectKey).then(setItems);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText('');
    projectsApi.addSubtask(projectKey, v).then(load);
  };

  if (items === null) return null;

  return (
    <div>
      {items.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '4px 0' }}>
          Nothing listed for this project yet
        </div>
      )}
      {items.map((st) => (
        <div key={st.pid} className="task-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, borderRadius: RADIUS.control }}>
          <button
            onClick={() => projectsApi.toggleSubtask(st.pid).then(load)}
            title={st.done ? 'Mark not done' : 'Mark done'}
            aria-pressed={st.done}
            style={{
              width: 16,
              height: 16,
              padding: 0,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              lineHeight: 1,
              borderRadius: RADIUS.pill,
              border: `1px solid ${st.done ? 'var(--success)' : 'var(--text-faint)'}`,
              background: st.done ? 'var(--success)' : 'transparent',
              color: st.done ? 'var(--on-accent)' : 'transparent',
            }}
          >
            <Check size={12} />
          </button>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              color: st.done ? 'var(--text-muted)' : 'var(--text)',
              textDecoration: st.done ? 'line-through' : undefined,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {st.text}
          </span>
          {!st.done && (
            <button
              onClick={() => projectsApi.strikeSubtask(st.pid).then(() => { load(); onPromoted(); })}
              title="Put this in today's list"
              className="btn-ghost"
              style={{ fontSize: 12, height: 24, padding: '0 8px', flex: 'none', color: accent }}
            >
              → today
            </button>
          )}
          <button
            onClick={() => projectsApi.deleteSubtask(st.pid).then(load)}
            title="Delete this"
            aria-label="Delete this task"
            className="btn-ghost"
            style={{ width: 28, height: 28, padding: 0, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <form onSubmit={add} style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <input
          aria-label={`Add to this project`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add to this project…"
          style={{ flex: 1, minWidth: 0, fontSize: 13, height: 32, padding: '0 8px' }}
        />
      </form>
    </div>
  );
}


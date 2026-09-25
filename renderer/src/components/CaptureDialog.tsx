import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { NoteHead, ProjectKey, ProjectOrderEntry, notesApi, projectsApi, tasksApi } from '../services/api';
import { useL } from '../i18n';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { RADIUS, SPACE } from '../spacing';

// One box for writing anything down, from anywhere (Ctrl+K or the + next
// to the gear). Before it, a task could be added in six places — the
// project card, TASK LIST, Goals, the goal board, Journey and weekly
// planning — and a note in two, each with its own box and its own rules,
// so "where do I put this" came before writing it. Those boxes all stay;
// this is the one that works from every screen.
//
// A task goes to today's list, to later (tomorrow), or into a project's
// task list; a note goes to NOTES, under a head if you pick one. The
// place you picked last is remembered, and the box stays open after a
// save so several things can be written down in a row.

type Kind = 'task' | 'note';
type TaskDest = 'today' | 'later' | ProjectKey;

const STORE = 'capture-last';

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readLast(): { kind: Kind; dest: string; head: number | null } | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function CaptureDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const L = useL();
  const last = readLast();
  const [kind, setKind] = useState<Kind>(last?.kind ?? 'task');
  const [dest, setDest] = useState<TaskDest>((last?.dest as TaskDest) ?? 'today');
  const [head, setHead] = useState<number | null>(last?.head ?? null);
  const [text, setText] = useState('');
  const [projects, setProjects] = useState<ProjectOrderEntry[]>([]);
  const [heads, setHeads] = useState<NoteHead[]>([]);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fieldRef.current?.focus();
    projectsApi
      .order()
      .then((o) => {
        const named = o.filter((e) => e.project.name.trim());
        setProjects(named);
        // With no remembered choice, a task goes to the project that is
        // open in panel 1 — the one you are most likely thinking about.
        if (!last) {
          const open = named.find((e) => !e.project.collapsed);
          if (open) setDest(open.project.key as ProjectKey);
        }
      })
      .catch(() => setProjects([]));
    notesApi
      .heads()
      .then(setHeads)
      .catch(() => setHeads([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes this box only, not whatever dialog is behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // A remembered project that has since been renamed away or deleted
  // falls back to today's list rather than failing on save.
  const validDest: TaskDest =
    dest === 'today' || dest === 'later' || projects.length === 0 || projects.some((e) => e.project.key === dest) ? dest : 'today';

  const destName = (d: TaskDest) =>
    d === 'today'
      ? L("today's list", 'আজকের তালিকা')
      : d === 'later'
        ? L('later (tomorrow)', 'পরে (আগামীকাল)')
        : projects.find((e) => e.project.key === d)?.project.name ?? d;

  const save = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError('');
    try {
      let where: string;
      if (kind === 'task') {
        if (validDest === 'today' || validDest === 'later') {
          const day = new Date();
          if (validDest === 'later') day.setDate(day.getDate() + 1);
          await tasksApi.create(t, 'focus', isoOf(day));
        } else {
          await projectsApi.addSubtask(validDest, t);
          window.dispatchEvent(new CustomEvent('project-tasks-changed', { detail: validDest }));
        }
        where = destName(validDest);
      } else {
        await notesApi.create(t, head);
        window.dispatchEvent(new Event('notes-changed'));
        where = `NOTES${head !== null ? ` › ${heads.find((h) => h.id === head)?.name ?? ''}` : ''}`;
      }
      try {
        localStorage.setItem(STORE, JSON.stringify({ kind, dest: validDest, head }));
      } catch {
        /* remembering the choice is a convenience only */
      }
      onSaved();
      setText('');
      setSaved(L(`✓ Saved to ${where}`, `✓ ${where}-এ সেভ হয়েছে`));
      fieldRef.current?.focus();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const seg = (on: boolean, i: number): React.CSSProperties => ({
    height: 28,
    padding: `0 ${SPACE.md}px`,
    border: 'none',
    borderLeft: i ? '1px solid var(--border)' : 'none',
    borderRadius: 0,
    background: on ? 'var(--accent)' : 'var(--surface)',
    color: on ? 'var(--on-accent)' : 'var(--text)',
    fontSize: 12,
    fontWeight: on ? 700 : 400,
    cursor: 'pointer',
  });
  const select: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    height: 32,
    fontSize: 13,
    border: '1px solid var(--border)',
    borderRadius: RADIUS.control,
    background: 'var(--surface)',
    color: 'var(--text)',
    padding: `0 ${SPACE.sm}px`,
  };

  return (
    // Mouse-only close-on-backdrop-click; Escape is handled above.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        zIndex: 2100,
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: RADIUS.card,
          boxShadow: 'var(--shadow-md)',
          padding: SPACE.lg,
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE.md,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <h2 id="capture-title" style={{ margin: 0, fontSize: 16 }}>
            {L('Capture', 'লিখে রাখুন')}
          </h2>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Ctrl+K</span>
          <span style={{ flex: 1 }} />
          <div role="radiogroup" aria-label={L('What is it', 'কী লিখছেন')} style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: RADIUS.control, overflow: 'hidden' }}>
            {(
              [
                ['task', L('Task', 'কাজ')],
                ['note', L('Note', 'নোট')],
              ] as [Kind, string][]
            ).map(([k, label], i) => (
              <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} style={seg(kind === k, i)}>
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            title={L('Close', 'বন্ধ')}
            aria-label={L('Close', 'বন্ধ')}
            style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={15} />
          </button>
        </div>

        <textarea
          ref={fieldRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (saved) setSaved('');
          }}
          onKeyDown={(e) => {
            // A task is one line, so Enter saves it; a note can run to
            // several, so there Enter is a new line and Ctrl+Enter saves.
            if (e.key === 'Enter' && (kind === 'task' ? !e.shiftKey : e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              save();
            }
          }}
          rows={kind === 'task' ? 2 : 4}
          placeholder={kind === 'task' ? L('What needs doing?', 'কী করতে হবে?') : L('Write it down…', 'লিখে ফেলুন…')}
          aria-label={kind === 'task' ? L('Task', 'কাজ') : L('Note', 'নোট')}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            fontSize: 14,
            lineHeight: 1.5,
            padding: SPACE.sm,
            resize: 'vertical',
            border: '1px solid var(--border)',
            borderRadius: RADIUS.control,
            background: 'var(--bg)',
            color: 'var(--text)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{L('Save to', 'কোথায়')}</span>
          {kind === 'task' ? (
            <select value={validDest} onChange={(e) => setDest(e.target.value as TaskDest)} aria-label={L('Save to', 'কোথায়')} style={select}>
              <option value="today">{L("Today's list", 'আজকের তালিকা')}</option>
              <option value="later">{L('Later (tomorrow)', 'পরে (আগামীকাল)')}</option>
              {projects.length > 0 && (
                <optgroup label={L('Project tasks', 'প্রজেক্টের কাজ')}>
                  {projects.map((e) => (
                    <option key={e.project.key} value={e.project.key}>
                      {e.number}. {e.project.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          ) : (
            <select
              value={head === null ? '' : String(head)}
              onChange={(e) => setHead(e.target.value === '' ? null : Number(e.target.value))}
              aria-label={L('Head', 'হেড')}
              style={select}
            >
              <option value="">{L('NOTES — no head', 'NOTES — হেড ছাড়া')}</option>
              {heads.map((h) => (
                <option key={h.id} value={h.id}>
                  NOTES › {h.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={save}
            disabled={!text.trim() || busy}
            style={{
              height: 32,
              padding: `0 ${SPACE.lg}px`,
              border: 'none',
              borderRadius: RADIUS.control,
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              fontSize: 13,
              fontWeight: 700,
              opacity: text.trim() ? 1 : 0.5,
              cursor: text.trim() ? 'pointer' : 'default',
            }}
          >
            {L('Save', 'সেভ')}
          </button>
        </div>

        <span role="status" style={{ fontSize: 12, minHeight: 16, color: error ? 'var(--danger)' : saved ? 'var(--success)' : 'var(--text-faint)' }}>
          {error ||
            saved ||
            (kind === 'task'
              ? L('Enter saves · Shift+Enter for a new line · Esc closes', 'Enter = সেভ · Shift+Enter = নতুন লাইন · Esc = বন্ধ')
              : L('Ctrl+Enter saves · Esc closes', 'Ctrl+Enter = সেভ · Esc = বন্ধ'))}
        </span>
      </div>
    </div>
  );
}

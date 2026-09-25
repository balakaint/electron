import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import { Note, NoteHead, notesApi } from '../services/api';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { useAutofocus } from '../hooks/useAutofocus';
import { useUndo } from '../undo';
import { RADIUS, SPACE } from '../spacing';
import { segmentedKeyDown } from '../segmentedKeys';
import { useL } from '../i18n';

// Global quick-capture notes, EXECUTE's own NOTES tab. Scoped down hard
// from the brief this was designed against (docs discussion, 2026-09-22):
// no markdown renderer (none exists anywhere else in this app — a plain
// autosizing textarea matches "speed of capture over feature richness",
// the brief's own stated priority, and every other note-like field this
// app already has: Project.note, Project.detail_note, Goal.note), no
// IndexedDB/offline-sync (this app has exactly one local backend that is
// either up or the whole app is down — there is no second party to
// conflict with), no responsive breakpoints (Panel 3 is a fixed ~545px
// column, not a browser page), no slash-commands/version-history/paste-
// handling/virtualization (deferred; not needed at the note counts this
// feature will see for a while).
//
// Reuses this app's own existing plumbing instead of the brief's generic
// web-app one: useAutosave (already powers Goal/Project notes) for every
// edit, and the app's global Ctrl+Z undo stack (undo.tsx, already used by
// TaskList's strike/done toggles) for delete — no bespoke "8s toast"
// timer to build.

function relativeTime(unixSecs: number, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs / 1000 - unixSecs);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSecs * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Grows with content up to `maxRows`, then scrolls internally — the
// brief's "auto-expands to max 6 lines" for quick-capture, reused for
// the expanded editor at a taller cap. No measurement library: textarea
// scrollHeight against a reset height is the standard technique.
function useAutosizeTextarea(ref: React.RefObject<HTMLTextAreaElement>, value: string, maxRows: number) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lineHeight = 22; // ~14px/1.6, close enough for a max-height cap, not a layout measurement
    const max = maxRows * lineHeight;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [ref, value, maxRows]);
}

function NoteCard({
  note,
  expanded,
  onToggle,
  onSaveBody,
  onTogglePin,
  onDelete,
  heads,
  onMoveHead,
  showHead,
}: {
  note: Note;
  expanded: boolean;
  onToggle: () => void;
  onSaveBody: (body: string) => void;
  onTogglePin: () => void;
  onDelete: () => void;
  heads: NoteHead[];
  onMoveHead: (headId: number | null) => void;
  // Name the note's head on the collapsed card (All/Pinned only — under
  // its own head it would just repeat the tab).
  showHead: boolean;
}) {
  const L = useL();
  const headName = heads.find((h) => h.id === note.head_id)?.name;
  const bodyField = useAutosave(note.body, onSaveBody);
  const textRef = useAutofocus<HTMLTextAreaElement>(expanded);
  useAutosizeTextarea(textRef, bodyField.value, 16);

  // Escape collapses, never discards — the field is already autosaving,
  // so there's nothing to lose by closing it.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, onToggle]);

  const preview = note.body.split('\n').slice(1).join(' ').trim();

  return (
    <div
      className="note-card card-elevated"
      style={{
        border: '1px solid var(--border)',
        borderLeft: note.pinned ? '2px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: RADIUS.card,
        padding: SPACE.md,
        marginBottom: SPACE.sm,
        background: 'var(--surface)',
      }}
    >
      {!expanded ? (
        // Siblings, not a clickable div wrapping the Pin/Delete buttons —
        // nesting real buttons inside another click/role="button"
        // container is the same anti-pattern AccordionSection's header
        // hit earlier this session (invalid, and relies on
        // stopPropagation to avoid double-firing). One button IS the
        // click target; Pin/Delete sit beside it, matching GoalRow's
        // own collapsed-row structure exactly.
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE.sm }}>
          <button
            onClick={onToggle}
            title="Open this note"
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
              font: 'inherit',
            }}
          >
            <div
              style={{
                // 14/600, not the brief's 15px — this app's own type
                // scale (typography.ts) has no 15 step; 14 is what
                // GoalRow already uses for a card's primary clickable
                // name, same role here.
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--header-accent)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {note.title}
            </div>
            {preview && (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                  lineHeight: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {preview}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: SPACE.xs, display: 'flex', gap: SPACE.sm, alignItems: 'center' }}>
              {relativeTime(note.updated_at)}
              {showHead && headName && (
                <span
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 999,
                    padding: '0 8px',
                    color: 'var(--text-muted)',
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {headName}
                </span>
              )}
            </div>
          </button>
          <div className="note-actions" style={{ display: 'flex', gap: 2, flex: 'none' }}>
            <button
              onClick={onTogglePin}
              className="btn-ghost"
              title={note.pinned ? 'Unpin' : 'Pin'}
              aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
              style={{ width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Pin size={14} fill={note.pinned ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={onDelete}
              className="btn-ghost"
              title="Delete"
              aria-label="Delete note"
              style={{ width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        // Reuses GoalRow's own entrance animation (styles/index.css,
        // .goal-row-open) — same "a row opening into an editor"
        // interaction, no reason for a second identical keyframe.
        <div className="goal-row-open">
          <textarea
            ref={textRef}
            value={bodyField.value}
            onChange={(e) => bodyField.setValue(e.target.value)}
            onBlur={bodyField.flush}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter = Done, same as the button.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                bodyField.flush();
                onToggle();
              }
            }}
            aria-label="Note text"
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              resize: 'none',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--text)',
              padding: 0,
              ...savedFlashStyle(bodyField.state),
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.xs }}>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {bodyField.state === 'pending' ? L('Saving…', 'সেভ হচ্ছে…') : L('Saved', 'সেভ হয়েছে')} · {relativeTime(note.updated_at)}
            </span>
            <span style={{ flex: 1 }} />
            {heads.length > 0 && (
              <select
                value={note.head_id ?? ''}
                onChange={(e) => onMoveHead(e.target.value ? Number(e.target.value) : null)}
                aria-label={L('Head', 'হেড')}
                style={{ fontSize: 12, height: 28, maxWidth: 140 }}
              >
                <option value="">{L('No head', 'হেড নেই')}</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => {
                bodyField.flush();
                onToggle();
              }}
              className="btn-primary"
              title="Ctrl+Enter"
              style={{ fontSize: 12, height: 28, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: SPACE.xs }}
            >
              <Check size={12} /> {L('Done', 'শেষ')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// All and Pinned are fixed; a number is one of the user's own heads.
type Filter = 'all' | 'pinned' | number;
const FILTER_KEY = 'notes-filter';

function loadFilter(): Filter {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    if (v === 'pinned') return 'pinned';
    if (v && /^\d+$/.test(v)) return Number(v);
  } catch {
    /* storage unavailable */
  }
  return 'all';
}

export default function NotesTab() {
  const L = useL();
  const [notes, setNotes] = useState<Note[]>([]);
  const [heads, setHeads] = useState<NoteHead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilterState] = useState<Filter>(loadFilter);
  const setFilter = (f: Filter) => {
    setFilterState(f);
    setHeadEdit(null);
    try {
      localStorage.setItem(FILTER_KEY, String(f));
    } catch {
      /* remembered for this session only */
    }
  };
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  // ONE expanded note at a time — same reasoning GoalsPanel's own
  // openGoalId already established: two open editors is two places to
  // look for the thing you're editing.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { push: pushUndo } = useUndo();
  const searchRef = useAutofocus<HTMLInputElement>(searchOpen);
  // Head editing: null, typing a new head's name, renaming the selected
  // head, or asking before deleting it.
  const [headEdit, setHeadEdit] = useState<null | 'new' | 'rename' | 'delete'>(null);
  const [headName, setHeadName] = useState('');
  const [headError, setHeadError] = useState('');
  const headInputRef = useAutofocus<HTMLInputElement>(headEdit === 'new' || headEdit === 'rename');
  const [justSaved, setJustSaved] = useState(false);

  const refresh = () => {
    setLoadError(false);
    Promise.all([notesApi.list(), notesApi.heads()])
      .then(([ns, hs]) => {
        setNotes(ns);
        setHeads(hs);
        setLoaded(true);
        // A remembered head that no longer exists falls back to All.
        setFilterState((f) => (typeof f === 'number' && !hs.some((h) => h.id === f) ? 'all' : f));
      })
      .catch(() => {
        setLoadError(true);
        setLoaded(true);
      });
  };
  useEffect(() => {
    refresh();
  }, []);

  const currentHead = typeof filter === 'number' ? heads.find((h) => h.id === filter) ?? null : null;

  // Quick-capture: the FIRST save creates a note in the background (via
  // useAutosave's own debounce, so rapid typing still coalesces into one
  // create call), every save after that edits the same note. Saves are
  // chained one after another: without that, a second save could start
  // while the first create was still in flight and create a duplicate.
  // A note written while a head is open is filed under that head.
  const draftIdRef = useRef<number | null>(null);
  const draftHeadRef = useRef<number | null>(null);
  draftHeadRef.current = currentHead?.id ?? null;
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const draft = useAutosave<string>('', (v) => {
    const run = () => {
      if (!v.trim()) return Promise.resolve();
      if (draftIdRef.current === null) {
        return notesApi.create(v, draftHeadRef.current).then((n) => {
          draftIdRef.current = n.id;
          refresh();
        });
      }
      return notesApi.edit(draftIdRef.current, { body: v }).then(() => refresh());
    };
    chainRef.current = chainRef.current.then(run, run);
    return chainRef.current;
  });
  const draftRef = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(draftRef, draft.value, 6);

  // Save: commit now, wait for it to land, then clear the box for the
  // next note — the "done with this one" step, one click or Ctrl+Enter.
  const saveDraft = () => {
    if (!draft.value.trim()) return;
    draft.flush();
    chainRef.current.then(() => {
      draftIdRef.current = null;
      draft.setValue('');
      draftRef.current?.focus();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    });
  };

  const startNewDraft = () => {
    if (draft.value.trim()) {
      saveDraft();
      return;
    }
    draftRef.current?.focus();
  };

  const togglePin = (n: Note) => notesApi.edit(n.id, { pinned: !n.pinned }).then(refresh);

  const deleteNote = (n: Note) => {
    if (expandedId === n.id) setExpandedId(null);
    notesApi.remove(n.id).then(() => {
      refresh();
      pushUndo({
        label: 'delete note',
        undo: () => notesApi.restore(n.id).then(refresh),
        redo: () => notesApi.remove(n.id).then(refresh),
      });
    });
  };

  const submitHead = () => {
    const name = headName.trim();
    if (!name) {
      setHeadEdit(null);
      return;
    }
    const p = headEdit === 'rename' && currentHead ? notesApi.renameHead(currentHead.id, name) : notesApi.createHead(name);
    p.then((h) => {
      setHeadEdit(null);
      setHeadName('');
      setHeadError('');
      refresh();
      setFilter(h.id);
    }).catch((e) => setHeadError(String(e?.message ?? e)));
  };

  const deleteHead = () => {
    if (!currentHead) return;
    notesApi.removeHead(currentHead.id).then(() => {
      setFilter('all');
      refresh();
    });
  };

  // Pinned notes are set apart only on the Pinned page. Everywhere else
  // it is one list, newest first; the pin icon still marks them.
  const visible = notes
    .filter((n) => {
      if (filter === 'pinned' && !n.pinned) return false;
      if (typeof filter === 'number' && n.head_id !== filter) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
    })
    .sort((a, b) => b.updated_at - a.updated_at);

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: L('All', 'সব'), n: notes.length },
    { key: 'pinned', label: L('Pinned', 'পিন করা'), n: notes.filter((x) => x.pinned).length },
    ...heads.map((h) => ({ key: h.id as Filter, label: h.name, n: notes.filter((x) => x.head_id === h.id).length })),
  ];
  const smallBtn: React.CSSProperties = { fontSize: 12, height: 28, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: SPACE.xs };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header: count, search toggle, + New. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-faint)' }}>NOTES</span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>({notes.length})</span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className="btn-ghost"
          title="Search notes"
          aria-label="Search notes"
          aria-pressed={searchOpen}
          style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Search size={14} />
        </button>
        <button onClick={startNewDraft} className="btn-primary" style={{ fontSize: 12, height: 28, padding: '0 8px' }}>
          + New
        </button>
      </div>

      {searchOpen && (
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearch('');
              setSearchOpen(false);
            }
          }}
          placeholder="Search notes…"
          aria-label="Search notes"
          style={{ fontSize: 13, padding: '4px 8px', marginBottom: SPACE.sm }}
        />
      )}

      {/* Heads: All and Pinned always, then the user's own, then + Head.
          Each shows its count, so "Ideas 4" says whether it is worth
          opening before you open it. Wraps when there are many. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.xs, marginBottom: SPACE.sm }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            padding: SPACE.hair,
            gap: SPACE.hair,
            background: 'var(--surface-2, var(--surface))',
            borderRadius: RADIUS.card,
          }}
        >
          {tabs.map((t) => {
            const on = filter === t.key;
            return (
              <button
                key={String(t.key)}
                aria-pressed={on}
                onClick={() => setFilter(t.key)}
                onKeyDown={(e) => segmentedKeyDown(e, tabs.map((x) => x.key), filter, setFilter)}
                style={{
                  height: 32,
                  padding: `0 ${SPACE.md}px`,
                  fontSize: 12,
                  fontWeight: on ? 700 : 400,
                  border: 'none',
                  borderRadius: RADIUS.control,
                  background: on ? 'var(--surface)' : 'transparent',
                  color: on ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: on ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                  maxWidth: 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
                <span style={{ marginLeft: SPACE.xs, fontWeight: 400, color: 'var(--text-muted)' }}>{t.n}</span>
              </button>
            );
          })}
        </div>
        {headEdit !== 'new' && (
          <button
            onClick={() => {
              setHeadEdit('new');
              setHeadName('');
              setHeadError('');
            }}
            className="btn-ghost"
            title={L('Add a head', 'হেড যোগ করুন')}
            style={smallBtn}
          >
            <Plus size={12} /> {L('Head', 'হেড')}
          </button>
        )}
      </div>

      {/* New head / rename: type, Enter to save, Esc to cancel. */}
      {(headEdit === 'new' || headEdit === 'rename') && (
        <div style={{ display: 'flex', gap: SPACE.sm, marginBottom: SPACE.sm }}>
          <input
            ref={headInputRef}
            value={headName}
            maxLength={30}
            onChange={(e) => setHeadName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitHead();
              if (e.key === 'Escape') setHeadEdit(null);
            }}
            placeholder={headEdit === 'new' ? L('New head, e.g. Ideas', 'নতুন হেড, যেমন Ideas') : L('New name', 'নতুন নাম')}
            aria-label={L('Head name', 'হেডের নাম')}
            style={{ flex: 1, fontSize: 13, padding: '4px 8px' }}
          />
          <button onClick={submitHead} className="btn-primary" style={smallBtn}>
            <Check size={12} /> {L('Save', 'সেভ')}
          </button>
          <button onClick={() => setHeadEdit(null)} className="btn-ghost" style={smallBtn}>
            {L('Cancel', 'বাতিল')}
          </button>
        </div>
      )}
      {headError && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: SPACE.sm }}>{headError}</div>}

      {/* The open head's own controls. Deleting a head keeps its notes —
          they go back to All — and says so before doing it. */}
      {currentHead && headEdit !== 'new' && headEdit !== 'rename' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, marginBottom: SPACE.sm, fontSize: 12, color: 'var(--text-muted)' }}>
          {headEdit === 'delete' ? (
            <>
              <span style={{ flex: 1 }}>
                {L(`Delete “${currentHead.name}”? Its notes stay, under All.`, `“${currentHead.name}” মুছবেন? নোটগুলো থাকবে, All-এ।`)}
              </span>
              <button onClick={deleteHead} className="btn-ghost" style={{ ...smallBtn, color: 'var(--danger)' }}>
                {L('Delete', 'মুছুন')}
              </button>
              <button onClick={() => setHeadEdit(null)} className="btn-ghost" style={smallBtn}>
                {L('Cancel', 'বাতিল')}
              </button>
            </>
          ) : (
            <>
              <span style={{ flex: 1 }}>{L('New notes here go under this head.', 'এখানে লেখা নতুন নোট এই হেডে যাবে।')}</span>
              <button
                onClick={() => {
                  setHeadEdit('rename');
                  setHeadName(currentHead.name);
                  setHeadError('');
                }}
                className="btn-ghost"
                style={smallBtn}
              >
                <Pencil size={12} /> {L('Rename', 'নাম বদল')}
              </button>
              <button onClick={() => setHeadEdit('delete')} className="btn-ghost" style={smallBtn}>
                <Trash2 size={12} /> {L('Delete head', 'হেড মুছুন')}
              </button>
            </>
          )}
        </div>
      )}

      {/* Quick-capture, always the fastest way to a new note. It saves
          as you type; Save (or Ctrl+Enter) finishes it and clears the box
          for the next one. */}
      <div style={{ marginBottom: SPACE.md }}>
        <textarea
          ref={draftRef}
          value={draft.value}
          onChange={(e) => draft.setValue(e.target.value)}
          onBlur={draft.flush}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              saveDraft();
            }
          }}
          placeholder={
            currentHead ? L(`Write a note in ${currentHead.name}…`, `${currentHead.name}-এ নোট লিখুন…`) : L('Write a note…', 'নোট লিখুন…')
          }
          aria-label="New note"
          rows={1}
          style={{
            width: '100%',
            fontSize: 14,
            lineHeight: 1.6,
            padding: SPACE.sm,
            borderRadius: RADIUS.control,
            resize: 'none',
            boxSizing: 'border-box',
            ...savedFlashStyle(draft.state),
          }}
        />
        {(draft.value.trim() || justSaved) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.xs }}>
            <span style={{ fontSize: 12, color: justSaved ? 'var(--success)' : 'var(--text-faint)' }}>
              {justSaved
                ? L('✓ Saved', '✓ সেভ হয়েছে')
                : draft.state === 'pending'
                  ? L('Saving as you type… · Ctrl+Enter to finish', 'লেখার সাথে সেভ হচ্ছে… · শেষ করতে Ctrl+Enter')
                  : L('Saved as you type · Ctrl+Enter to finish', 'লেখার সাথে সেভ হয়েছে · শেষ করতে Ctrl+Enter')}
            </span>
            <span style={{ flex: 1 }} />
            {draft.value.trim() && (
              <button onClick={saveDraft} className="btn-primary" style={smallBtn}>
                <Check size={12} /> {L('Save', 'সেভ')}
              </button>
            )}
          </div>
        )}
      </div>

      {!loaded ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Loading…</div>
      ) : loadError ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE.sm,
            fontSize: 12,
            color: 'var(--danger)',
            border: '1px solid var(--danger)',
            borderRadius: RADIUS.control,
            padding: '8px 12px',
          }}
        >
          <span>Couldn't load — check the app is connected.</span>
          <button className="btn-ghost" style={{ fontSize: 12, flex: 'none' }} onClick={refresh}>
            Retry
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 0' }}>
          {search.trim()
            ? `No notes match "${search.trim()}".`
            : filter === 'pinned'
              ? L('Nothing pinned yet.', 'এখনো কিছু পিন করা নেই।')
              : currentHead
                ? L(`Nothing in ${currentHead.name} yet — write one above.`, `${currentHead.name}-এ এখনো কিছু নেই — উপরে লিখুন।`)
                : L('Nothing here yet — write your first note above.', 'এখনো কিছু নেই — উপরে প্রথম নোট লিখুন।')}
        </div>
      ) : (
        <div>
          {visible.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              expanded={expandedId === n.id}
              onToggle={() => setExpandedId((cur) => (cur === n.id ? null : n.id))}
              onSaveBody={(body) => notesApi.edit(n.id, { body }).then(refresh)}
              onTogglePin={() => togglePin(n)}
              onDelete={() => deleteNote(n)}
              heads={heads}
              onMoveHead={(headId) => notesApi.edit(n.id, { head_id: headId }).then(refresh)}
              showHead={typeof filter !== 'number'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

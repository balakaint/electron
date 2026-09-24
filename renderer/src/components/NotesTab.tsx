import { useEffect, useRef, useState } from 'react';
import { Pin, Search, X } from 'lucide-react';
import { Note, notesApi } from '../services/api';
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
}: {
  note: Note;
  expanded: boolean;
  onToggle: () => void;
  onSaveBody: (body: string) => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
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
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: SPACE.xs }}>
              {relativeTime(note.updated_at)}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACE.xs }}>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{relativeTime(note.updated_at)}</span>
            <button onClick={onToggle} className="btn-ghost" style={{ fontSize: 12, height: 28, padding: '0 8px' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Filter = 'all' | 'pinned';

export default function NotesTab() {
  const L = useL();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  // ONE expanded note at a time — same reasoning GoalsPanel's own
  // openGoalId already established: two open editors is two places to
  // look for the thing you're editing.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { push: pushUndo } = useUndo();
  const searchRef = useAutofocus<HTMLInputElement>(searchOpen);

  const refresh = () => {
    setLoadError(false);
    notesApi
      .list()
      .then((ns) => {
        setNotes(ns);
        setLoaded(true);
      })
      .catch(() => {
        setLoadError(true);
        setLoaded(true);
      });
  };
  useEffect(() => {
    refresh();
  }, []);

  // Quick-capture: the FIRST keystroke creates a note in the background
  // (via useAutosave's own debounce, so rapid typing still coalesces
  // into one create call, not one per character); every keystroke after
  // that edits the same note. "+ New" flushes and resets both the ref
  // and the field, ready to capture the next note.
  const draftIdRef = useRef<number | null>(null);
  const draft = useAutosave<string>('', (v) => {
    if (!v.trim()) return Promise.resolve();
    if (draftIdRef.current === null) {
      return notesApi.create(v).then((n) => {
        draftIdRef.current = n.id;
        refresh();
      });
    }
    return notesApi.edit(draftIdRef.current, { body: v }).then(() => refresh());
  });
  const draftRef = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(draftRef, draft.value, 6);

  const startNewDraft = () => {
    draft.flush();
    draftIdRef.current = null;
    draft.setValue('');
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

  const visible = notes.filter((n) => {
    if (filter === 'pinned' && !n.pinned) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header: count, search toggle, All/Pinned chips, + New. */}
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

      {/* The same segmented control the other EXECUTE views use, with
          each option's count in it — "Pinned 2" says whether switching
          is worth it before you switch. */}
      <div
        style={{
          display: 'flex',
          alignSelf: 'flex-start',
          padding: SPACE.hair,
          marginBottom: SPACE.md,
          background: 'var(--surface-2, var(--surface))',
          borderRadius: RADIUS.card,
        }}
      >
        {(['all', 'pinned'] as Filter[]).map((f) => {
          const on = filter === f;
          const n = f === 'all' ? notes.length : notes.filter((x) => x.pinned).length;
          return (
            <button
              key={f}
              aria-pressed={on}
              onClick={() => setFilter(f)}
              onKeyDown={(e) => segmentedKeyDown(e, ['all', 'pinned'] as Filter[], filter, setFilter)}
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
              }}
            >
              {f === 'all' ? L('All', 'সব') : L('Pinned', 'পিন করা')}
              <span style={{ marginLeft: SPACE.xs, fontWeight: 400, color: 'var(--text-muted)' }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Quick-capture — pinned at the top, always visible, always the
          fastest way to a new note. */}
      <textarea
        ref={draftRef}
        value={draft.value}
        onChange={(e) => draft.setValue(e.target.value)}
        onBlur={draft.flush}
        placeholder="Write a note…"
        aria-label="New note"
        rows={1}
        style={{
          width: '100%',
          fontSize: 14,
          lineHeight: 1.6,
          padding: SPACE.sm,
          borderRadius: RADIUS.control,
          resize: 'none',
          marginBottom: SPACE.md,
          boxSizing: 'border-box',
          ...savedFlashStyle(draft.state),
        }}
      />

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
              ? 'Nothing pinned yet.'
              : 'Nothing here yet — write your first note above.'}
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { ChevronUp, Pause, Play, Star, X } from 'lucide-react';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { BoardCard, BoardCol, BoardPriority, boardApi } from '../services/api';
import { RADIUS } from '../spacing';
import { useAutofocus } from '../hooks/useAutofocus';

// Same format and "sessions[-1].end === null" running convention as
// NowCard.tsx's own formatHMS/isRunning — not imported from there (both
// are module-private to that file) but deliberately identical rather
// than inventing a second time format for the app to speak.
function formatHMS(secs: number): string {
  const total = Math.max(0, Math.round(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
function isRunning(card: BoardCard): boolean {
  return card.sessions.length > 0 && card.sessions[card.sessions.length - 1].end === null;
}

// Real start/stop timer for a card sitting in FOCUS — added 2026-09-16
// (Zahid: the standalone `ele kanban` pilot this board's card contract
// was ported from had a header countdown that was purely cosmetic,
// "never tied to anything real"; this one tracks actual elapsed time on
// the card itself). Only rendered for col === 'focus', matching the
// explicit choice made for the pilot's own equivalent redesign: this is
// a FOCUS-card timer, not a general per-card stopwatch.
function CardTimer({ card, onToggle }: { card: BoardCard; onToggle: () => void }) {
  const running = isRunning(card);
  const [displaySecs, setDisplaySecs] = useState(card.secs);

  useEffect(() => {
    setDisplaySecs(card.secs);
    if (!running) return;
    const id = setInterval(() => setDisplaySecs((d) => d + 1), 1000);
    return () => clearInterval(id);
  }, [card.id, card.secs, running]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px solid var(--border)',
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        title={running ? 'Pause timer' : 'Start timer'}
        aria-label={running ? 'Pause timer' : 'Start timer'}
        aria-pressed={running}
        style={{
          width: 22,
          height: 22,
          flex: 'none',
          border: 'none',
          borderRadius: RADIUS.pill,
          background: running ? 'var(--accent)' : 'var(--accent-light)',
          color: running ? 'var(--on-accent)' : 'var(--accent)',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {running ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
      </button>
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 700,
          color: running ? 'var(--accent)' : 'var(--text-muted)',
        }}
      >
        {formatHMS(displaySecs)}
      </span>
    </div>
  );
}

// INDIVIDUAL TASK BOARD — one Task's own QUEUED / FOCUS / CLOSED kanban.
//
// Ported card contract and column logic from ProjectBoard.tsx (which
// itself was ported from the standalone `ele kanban` Electron pilot),
// re-scoped to a single BoardTask's cards instead of a whole project's.
// The one real layout difference: ProjectBoard had to STACK its three
// columns because Panel 2 is a ~440px column. This board lives inside
// GoalBoardOverlay, a full-window overlay (the "full-window overlay
// (Recommended)" option the user explicitly chose over cramming this
// into Panel 2) — so there is real horizontal room, and the three
// columns sit SIDE BY SIDE, same as the `ele kanban` pilot originally
// drew them.
const COLS: { key: BoardCol; label: string; glyph: string; accent: string }[] = [
  { key: 'todo', label: 'QUEUED', glyph: '○', accent: 'var(--text-muted)' },
  { key: 'focus', label: 'FOCUS', glyph: '◉', accent: 'var(--accent)' },
  { key: 'done', label: 'CLOSED', glyph: '✓', accent: 'var(--success)' },
];

const PRIORITY_COLOR: Record<BoardPriority, string> = {
  high: 'var(--danger)',
  normal: 'var(--text-muted)',
  low: 'var(--text-faint)',
};

// Click-to-cycle order — added 2026-09-16, Zahid: the pill used to be
// set-once-at-creation with no way to change it, "normal high medium
// not changed by click". normal -> high -> low -> normal, matching how
// the tag already ranks visually top-to-bottom (danger -> muted ->
// faint) rather than the enum's own DB order (low, normal, high).
const NEXT_PRIORITY: Record<BoardPriority, BoardPriority> = {
  normal: 'high',
  high: 'low',
  low: 'normal',
};

function CardRow({
  card,
  accent,
  open,
  onOpen,
  onClose,
  onTogglePin,
  onDelete,
  onEditTitle,
  onEditNote,
  onMove,
  onToggleTimer,
  onCyclePriority,
}: {
  card: BoardCard;
  accent: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onEditTitle: (title: string) => void;
  onEditNote: (note: string) => void;
  onMove: (dir: -1 | 1) => void;
  onToggleTimer: () => void;
  onCyclePriority: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const titleInputRef = useAutofocus<HTMLInputElement>(open);
  const noteField = useAutosave(card.note, onEditNote);
  useEffect(() => setTitle(card.title), [card.title]);

  const idx = COLS.findIndex((c) => c.key === card.col);

  const pin = (
    <button
      onClick={onTogglePin}
      title={card.pinned ? 'Unpin' : 'Pin to top'}
      aria-pressed={card.pinned}
      style={{
        width: 22,
        height: 22,
        flex: 'none',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: card.pinned ? 'var(--accent)' : 'var(--text-faint)',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Star size={13} fill={card.pinned ? 'currentColor' : 'none'} />
    </button>
  );

  const del = (
    <button
      className="goal-x"
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      title="Delete this card"
      aria-label="Delete this card"
      style={{ width: 22, height: 22, flex: 'none', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <X size={13} />
    </button>
  );

  if (!open) {
    // A real card tile (title / note / priority tag), not a single-line
    // list row — the shape Zahid pointed to from the `ele kanban`
    // pilot's own board and said he liked ("typography box design").
    return (
      <div
        className="goal-row card-elevated"
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/board-card', String(card.id))}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderLeft: `3px solid ${PRIORITY_COLOR[card.priority]}`,
          borderRadius: RADIUS.card,
          padding: 8,
          marginBottom: 8,
          cursor: 'grab',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
          <button
            onClick={onOpen}
            title="Open this card"
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              border: 'none',
              background: 'transparent',
              font: 'inherit',
              fontSize: 13,
              fontWeight: 700,
              padding: 0,
              cursor: 'pointer',
              color: 'var(--text)',
            }}
          >
            {card.title}
          </button>
          {pin}
          {del}
        </div>

        {card.note && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {card.note}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          {/* NORMAL carries no signal (it's the baseline, unlike
              HIGH/LOW) — Zahid's own call, 2026-09-16: only show the
              text pill for HIGH/LOW, not for NORMAL. Still clickable
              either way (a bare dot when NORMAL) so a card can always
              be promoted to HIGH without opening it first. */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCyclePriority();
            }}
            title={`Priority: ${card.priority} — click to change to ${NEXT_PRIORITY[card.priority]}`}
            style={
              card.priority === 'normal'
                ? {
                    width: 8,
                    height: 8,
                    flex: 'none',
                    border: `1px solid ${PRIORITY_COLOR[card.priority]}`,
                    borderRadius: RADIUS.pill,
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                  }
                : {
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    color: PRIORITY_COLOR[card.priority],
                    background: `color-mix(in srgb, ${PRIORITY_COLOR[card.priority]} 14%, transparent)`,
                    border: 'none',
                    borderRadius: RADIUS.pill,
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }
            }
          >
            {card.priority === 'normal' ? '' : card.priority}
          </button>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            title={idx > 0 ? `Move to ${COLS[idx - 1].label}` : undefined}
            className="btn-ghost"
            style={{ width: 20, height: 20, padding: 0, flex: 'none', fontSize: 12 }}
          >
            ◀
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={idx === COLS.length - 1}
            title={idx < COLS.length - 1 ? `Move to ${COLS[idx + 1].label}` : undefined}
            className="btn-ghost"
            style={{ width: 20, height: 20, padding: 0, flex: 'none', fontSize: 12 }}
          >
            ▶
          </button>
        </div>
        {card.col === 'focus' && <CardTimer card={card} onToggle={onToggleTimer} />}
      </div>
    );
  }

  return (
    // Escape-to-close is delegated from whichever child has focus (the
    // rename input, most often) — the row itself is never meant to be
    // tabbed to, so a role/tabIndex here would add a focus stop that
    // does nothing.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="goal-row card-elevated"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: RADIUS.card,
        padding: '8px 8px',
        margin: '4px 0',
        boxShadow: 'var(--shadow-sm)',
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {pin}
        <input
          ref={titleInputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== card.title && onEditTitle(title.trim())}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 700, padding: '4px 0' }}
        />
        <button onClick={onClose} title="Close" aria-label="Close" style={{ width: 22, height: 22, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronUp size={14} />
        </button>
        {del}
      </div>
      <textarea
        value={noteField.value}
        onChange={(e) => noteField.setValue(e.target.value)}
        onBlur={noteField.flush}
        placeholder="Detail…"
        rows={2}
        style={{ width: '100%', fontSize: 12, padding: 4, marginTop: 8, resize: 'vertical', boxSizing: 'border-box', ...savedFlashStyle(noteField.state) }}
      />
      {card.col === 'focus' && <CardTimer card={card} onToggle={onToggleTimer} />}
    </div>
  );
}

function BoardSection({
  col,
  label,
  glyph,
  accent,
  cards,
  openId,
  onOpenChange,
  onAdd,
  onTogglePin,
  onDelete,
  onEditTitle,
  onEditNote,
  onMove,
  onDrop,
  onToggleTimer,
  onCyclePriority,
}: {
  col: BoardCol;
  label: string;
  glyph: string;
  accent: string;
  cards: BoardCard[];
  openId: number | null;
  onOpenChange: (id: number | null) => void;
  onAdd: (title: string, note: string) => void;
  onTogglePin: (id: number) => void;
  onDelete: (id: number) => void;
  onEditTitle: (id: number, title: string) => void;
  onEditNote: (id: number, note: string) => void;
  onMove: (id: number, dir: -1 | 1) => void;
  onDrop: (cardId: number) => void;
  onToggleTimer: (id: number) => void;
  onCyclePriority: (id: number) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const newTitleInputRef = useAutofocus<HTMLInputElement>(composing);
  const [newNote, setNewNote] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const t = newTitle.trim();
    if (!t) return;
    onAdd(t, newNote.trim());
    setNewTitle('');
    setNewNote('');
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = Number(e.dataTransfer.getData('text/board-card'));
        if (id) onDrop(id);
      }}
      style={{
        flex: '1 1 0',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: RADIUS.card,
        padding: 8,
        outline: dragOver ? `2px dashed ${accent}` : undefined,
        outlineOffset: -2,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 4px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
        <span style={{ color: accent, fontSize: 12 }}>{glyph}</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 12, letterSpacing: 0.5, color: accent }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{cards.length}</span>
        <button
          onClick={() => setComposing((v) => !v)}
          aria-expanded={composing}
          title={`Add to ${label}`}
          style={{ width: 22, height: 22, flex: 'none', border: 'none', background: composing ? 'var(--accent-light)' : 'transparent', borderRadius: RADIUS.control, color: composing ? 'var(--accent)' : 'var(--text-muted)', fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 0 }}
        >
          +
        </button>
      </div>

      {composing && (
        <form onSubmit={submitAdd} style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '4px 0' }}>
          <input
            ref={newTitleInputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setComposing(false)}
            placeholder="Card title"
            style={{ fontSize: 12, padding: 4 }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Detail (optional)"
              style={{ flex: 1, minWidth: 0, fontSize: 12, padding: 4 }}
            />
            <button type="submit" style={{ fontSize: 12 }}>Add</button>
          </div>
        </form>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {cards.length === 0 && !composing && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--text-faint)',
              padding: 8,
            }}
          >
            {col === 'focus' ? 'Nothing in front of you.' : col === 'done' ? 'Nothing closed yet.' : 'Nothing queued.'}
          </div>
        )}
        {cards.map((c) => (
          <CardRow
            key={c.id}
            card={c}
            accent={accent}
            open={openId === c.id}
            onOpen={() => onOpenChange(c.id)}
            onClose={() => onOpenChange(null)}
            onTogglePin={() => onTogglePin(c.id)}
            onDelete={() => onDelete(c.id)}
            onEditTitle={(title) => onEditTitle(c.id, title)}
            onEditNote={(note) => onEditNote(c.id, note)}
            onMove={(dir) => onMove(c.id, dir)}
            onToggleTimer={() => onToggleTimer(c.id)}
            onCyclePriority={() => onCyclePriority(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default function IndividualTaskBoard({ taskId }: { taskId: number }) {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  const refresh = () => boardApi.list(taskId).then(setCards);

  useEffect(() => {
    refresh();
    setOpenId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const move = (id: number, dir: -1 | 1) => {
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    const idx = COLS.findIndex((col) => col.key === c.col);
    const next = COLS[idx + dir];
    if (!next) return;
    boardApi.move(id, next.key).then((updated) => setCards((cs) => cs.map((x) => (x.id === updated.id ? updated : x))));
  };
  const dropOn = (col: BoardCol) => (cardId: number) => {
    boardApi.move(cardId, col).then((updated) => setCards((cs) => cs.map((x) => (x.id === updated.id ? updated : x))));
  };

  return (
    <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
      {COLS.map(({ key, label, glyph, accent }) => (
        <BoardSection
          key={key}
          col={key}
          label={label}
          glyph={glyph}
          accent={accent}
          cards={cards.filter((c) => c.col === key)}
          openId={openId}
          onOpenChange={setOpenId}
          onAdd={(title, note) => boardApi.add(taskId, key, title, note).then(() => refresh())}
          onTogglePin={(id) => boardApi.togglePin(id).then((c) => setCards((cs) => cs.map((x) => (x.id === c.id ? c : x))))}
          onDelete={(id) =>
            boardApi.remove(id).then(() => {
              setCards((cs) => cs.filter((x) => x.id !== id));
              setOpenId((cur) => (cur === id ? null : cur));
            })
          }
          onEditTitle={(id, title) => boardApi.edit(id, { title }).then((c) => setCards((cs) => cs.map((x) => (x.id === c.id ? c : x))))}
          onEditNote={(id, note) => boardApi.edit(id, { note }).then((c) => setCards((cs) => cs.map((x) => (x.id === c.id ? c : x))))}
          onMove={move}
          onToggleTimer={(id) => boardApi.toggleTimer(id).then((c) => setCards((cs) => cs.map((x) => (x.id === c.id ? c : x))))}
          onCyclePriority={(id) => {
            const c = cards.find((x) => x.id === id);
            if (!c) return;
            boardApi.edit(id, { priority: NEXT_PRIORITY[c.priority] }).then((updated) => setCards((cs) => cs.map((x) => (x.id === updated.id ? updated : x))));
          }}
          onDrop={dropOn(key)}
        />
      ))}
    </div>
  );
}

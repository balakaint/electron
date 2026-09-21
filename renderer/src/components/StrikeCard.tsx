import { Check, Square, Star } from 'lucide-react';
import { STRIKE_MAX, Task } from '../services/api';
import { useL } from '../i18n';
import { formatSecs } from '../format';

// Legacy's STRIKE card (task_tracker_v3_THEMES.py 5238-6025) — the three
// tasks you actually committed to today.
//
// It was missing from this port, and its absence was not cosmetic. The
// task list deliberately filters struck tasks out of the pool ("showing
// it in both places would put the same task on screen twice"), on the
// stated assumption that the STRIKE card above renders them. With no
// such card, striking a task made it VANISH: gone from LIST, and only
// ever one of them visible at a time in NOW. Commit three things and two
// of them were simply not on screen anywhere.
//
// The heading is "STRIKE" and not "MOST IMPORTANT TASKS" for legacy's
// reason (5251-5255): it is the app's own verb, and the same word as the
// "+ STRIKE" button on the project cards that fills this card. A heading
// that names the same thing in different words from the control feeding
// it is one concept wearing two names.

function titleCase(text: string): string {
  return text.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function clip(text: string, n: number): string {
  return text.length > n ? text.slice(0, n - 1) + '…' : text;
}

function isRunning(task: Task): boolean {
  return task.sessions.length > 0 && task.sessions[task.sessions.length - 1].end === null;
}

export default function StrikeCard({
  struck,
  nowId,
  flash,
  onToggleDone,
  onUnstrike,
  onSetNow,
  onSetMit,
}: {
  struck: Task[];
  nowId: number | null;
  flash: string | null;
  onToggleDone: (id: number) => void;
  onUnstrike: (id: number) => void;
  onSetNow: (id: number) => void;
  onSetMit: (t: Task) => void;
}) {
  const L = useL();
  const doneCount = struck.filter((t) => t.done).length;
  const free = STRIKE_MAX - struck.length;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: 8,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-muted)' }}>
          {L('STRIKE', 'স্ট্রাইক')}
        </span>
        {/* Legacy 5946-5956 rejected the "n / 3" form: "1/3" was a lie
            whenever fewer than three were committed — with two rows on
            screen and one finished it read as "one of three done" and
            implied a third task that does not exist. So the fraction
            measures what was ACTUALLY taken on and spare capacity is
            stated separately. Green only when something was committed
            and all of it is done; an empty day is not a finished one. */}
        {/* ...but with nothing committed there is no fraction to print
            at all. "0/0 · 3 free" was three numbers carrying no
            information: 0/0 is a statement about an empty set, and "3
            free" states a ceiling the three empty slots below already
            draw. The count appears the moment there is something to
            count. Opacity is gone with it — it dimmed the one number on
            the card that has to stay readable. */}
        {(flash || struck.length > 0) && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: struck.length > 0 && doneCount === struck.length ? 'var(--success)' : 'var(--text-muted)',
            }}
          >
            {flash ?? `${doneCount}/${struck.length}${free > 0 ? `  ·  ${free} free` : ''}`}
          </span>
        )}
      </div>

      {struck.length === 0 ? (
        // Three empty slots, not a sentence about three.
        //
        // "Empty. Choose up to 3 — that is the day." was an instruction
        // with no control beside it, and the control it referred to was
        // an unlabelled ◇ on a row below. The card that names this whole
        // tab neither showed the three nor offered a way to pick them.
        // Drawn as slots, the ceiling is structure rather than a claim,
        // and the empty card is the same shape as the full one — so
        // striking a task fills a slot you were already looking at
        // instead of replacing one thing with a different thing.
        <div style={{ padding: '4px 4px 4px' }}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 26,
                paddingLeft: 8,
                marginBottom: 4,
                border: '1px dashed var(--border)',
                color: 'var(--text-faint)',
                fontSize: 12,
              }}
            >
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{n}</span>
              {n === 1 && <span>{L('+ STRIKE a task below', 'নিচ থেকে + STRIKE দিন')}</span>}
            </div>
          ))}
        </div>
      ) : (
        struck.map((t) => {
          const isNow = t.id === nowId;
          return (
            <div
              key={t.id}
              // Clicking the row points NOW at it. A finished task is not
              // selectable — _now_task() would refuse it anyway, and a
              // click that visibly does nothing reads as a broken button.
              onClick={t.done ? undefined : () => onSetNow(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                position: 'relative',
                padding: '4px 4px 4px 8px',
                marginBottom: 4,
                cursor: t.done ? 'default' : 'pointer',
                // Two tones, not three: "selected" and "not".
                background: isNow ? 'var(--accent-light)' : 'transparent',
              }}
            >
              {/* A committed task must outweigh an uncommitted one. These
                  rows used to render quieter than the pool underneath —
                  the hierarchy ran backwards through the one decision
                  this screen exists to make. The rail and the primary
                  text weight put it the right way round (5978-5988). */}
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: t.done ? 'var(--border)' : 'var(--success)',
                }}
              />
              {/* The star moved here from the pool below, because what
                  it means only exists here: FIRST OF THE THREE. In the
                  pool it sat beside ◇ as a second, weaker way to say
                  "important" — two priority controls of the same size on
                  one row, one of which changed nothing on screen. NOW
                  opens on the starred task, so this is the control that
                  decides what you see when you sit down. */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetMit(t);
                }}
                title={t.mit ? 'First of the three — NOW opens here' : 'Make this the first of the three'}
                className="btn-ghost"
                style={{
                  color: t.mit ? 'var(--warning)' : 'var(--text-faint)',
                  cursor: 'pointer',
                  padding: 0,
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Star size={14} fill={t.mit ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDone(t.id);
                }}
                title={t.done ? 'Mark not done' : 'Mark done'}
                className="btn-ghost"
                style={{
                  color: t.done ? 'var(--success)' : 'var(--text-muted, inherit)',
                  cursor: 'pointer',
                  padding: 0,
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {t.done ? <Check size={15} /> : <Square size={15} />}
              </button>
              <span
                style={{
                  flex: 1,
                  fontSize: 14,
                  fontWeight: 700,
                  // See TaskList: dimming the row dims its contrast
                  // with it. Colour says "done"; opacity says "unreadable".
                  color: t.done ? 'var(--text-muted)' : undefined,
                  textDecoration: t.done ? 'line-through' : undefined,
                }}
              >
                {clip(titleCase(t.text), 40)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: isRunning(t) ? 'var(--danger)' : 'var(--text-muted)',
                }}
              >
                {formatSecs(t.secs)}
              </span>
              {/* Removing from the list is un-starring, nothing more: the
                  task survives and reappears in the pool below. Labelling
                  it ✕ beside a real delete button elsewhere would be
                  dangerous, so it is a minus (6009-6013). */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnstrike(t.id);
                }}
                title="Remove from today's list — the task itself stays"
                className="btn-ghost"
                style={{
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 14,
                  width: 24,
                  height: 24,
                }}
              >
                −
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

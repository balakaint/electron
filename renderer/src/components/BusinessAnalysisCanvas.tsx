import { useEffect, useState } from 'react';
import CircleSection from './CircleSection';
import { useAutosave } from '../useAutosave';
import {
  BusinessAnalysis,
  DecisionLogEntry,
  DecisionStatus,
  LegacyBox,
  NextPriority,
  Project,
  ProjectKey,
  businessAnalysisApi,
  projectsApi,
} from '../services/api';

// The Business Analysis page — legacy's _open_detail_window
// (task_tracker_v3_THEMES.py 10300-11090).
//
// WHAT WAS WRONG. This port had the right FIELDS and none of the page.
// Legacy lays out a full-window canvas of six cards on a 2-column grid
// and gives the rows deliberate weights; the port was a 640px column of
// stacked boxed textareas, which turns a page you read at a glance into
// a form you scroll. Zahid put the two side by side, and every
// difference below is one of his.
//
//   Row 0  IDEA               full width, its four fields ACROSS
//   Row 1  ANALYSIS | FINANCIAL REALITY        side by side, weight 2
//   Row 2  DECISION           full width, compact — chips, why, history
//   Row 3  NEXT ACTION | PEOPLE                side by side, weight 2
//
// Legacy's reasons for that shape, kept because they are the design:
//
// IDEA's four fields sit on ONE row (10920-10926) — "these four answers
// are each a sentence, not a paragraph, and putting them side by side
// means the whole idea is one horizontal read, what it is, what it
// fixes, who for, what success looks like, before the eye drops to the
// analysis below it. It also costs half the height, which is what
// leaves room for ANALYSIS and FINANCIAL to be the tallest sections on
// the page, as they should be."
//
// DECISION gets NO extra height (10745) — "it used to swallow most of
// the canvas for a four-chip row and one text area, which is exactly
// backwards: it is the shortest thing to write on the page and was
// given the most room to write it."
//
// PEOPLE sits beside NEXT ACTION (11062) — "the question it answers is
// who do I need for that, and the most common reason a next action
// doesn't move is a person who hasn't been chased." Its row is weighted
// because PEOPLE is the one block whose height is set by data rather
// than layout: "they can shrink, a list of people cannot."

const DECISION_STATUSES: DecisionStatus[] = ['GO', 'VALIDATE', 'PIVOT', 'NO-GO'];
const PRIORITIES: NextPriority[] = ['HIGH', 'MED', 'LOW'];

const STATUS_COLOR: Record<string, string> = {
  GO: 'var(--ba-go)',
  VALIDATE: 'var(--ba-validate)',
  PIVOT: 'var(--ba-pivot)',
  'NO-GO': 'var(--ba-nogo)',
};

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: 'var(--ba-nogo)',
  MED: 'var(--ba-validate)',
  LOW: 'var(--ba-neutral)',
};

/**
 * A labelled autosaving text area — legacy calls it "the atom of this
 * page" (_field, 10800-10850).
 *
 * Label above, text below, ONE HAIRLINE under it, and no box: "a full
 * border per field would put twelve boxes back on the screen, and the
 * label already tells the eye where one field ends and the next
 * begins". The port had drawn every field as a bordered textarea, which
 * is the version legacy rejected by name.
 *
 * The rule turns the section's accent while the field has focus — "the
 * whole of this page's where-am-I feedback, costing one pixel".
 */
function Field({
  label,
  value,
  accent,
  rows = 2,
  onSave,
  onSaved,
}: {
  label: string;
  value: string;
  accent: string;
  rows?: number;
  onSave: (next: string) => void;
  onSaved: () => void;
}) {
  const { value: text, setValue: setText, flush } = useAutosave(value, (v: string) => {
    onSave(v);
    onSaved();
  });
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: 2 }}>
        {label}
      </div>
      <textarea
        aria-label={label}
        value={text}
        rows={rows}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          flush();
        }}
        style={{
          flex: 1,
          width: '100%',
          minHeight: 0,
          fontSize: 13,
          padding: '2px 0',
          border: 'none',
          borderBottom: `1px solid ${focused ? accent : 'var(--border)'}`,
          background: 'transparent',
          color: 'var(--text)',
          resize: 'none',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

/** A section card: coloured rail, title, body. Legacy's _section_card. */
function Card({
  title,
  accent,
  children,
  style,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${accent}`,
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 'bold',
          letterSpacing: 0.5,
          padding: '8px 12px 4px',
          color: 'var(--text)',
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 12px 12px', flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

export default function BusinessAnalysisCanvas({ projectKey }: { projectKey: ProjectKey }) {
  const [ba, setBa] = useState<BusinessAnalysis | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [log, setLog] = useState<DecisionLogEntry[]>([]);
  const [boxes, setBoxes] = useState<LegacyBox[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  // One "Saved" for the page, in the header, as legacy has it — rather
  // than a flash on each of the fifteen fields.
  const [savedAt, setSavedAt] = useState(0);

  const refresh = () => {
    businessAnalysisApi.get(projectKey).then(setBa);
    businessAnalysisApi.getLog(projectKey).then(setLog);
  };

  useEffect(() => {
    refresh();
    businessAnalysisApi.getLegacyBoxes(projectKey).then(setBoxes);
    projectsApi.get(projectKey).then(setProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  if (!ba) return <div>Loading…</div>;

  const markSaved = () => setSavedAt(Date.now());
  const save = (field: keyof BusinessAnalysis, value: string) =>
    businessAnalysisApi.update(projectKey, { [field]: value }).then((v) => {
      setBa(v);
      markSaved();
    });

  const toggleStatus = (status: DecisionStatus) =>
    businessAnalysisApi.setDecisionStatus(projectKey, status).then((updated) => {
      setBa(updated);
      markSaved();
      businessAnalysisApi.getLog(projectKey).then(setLog);
    });

  const togglePriority = (priority: NextPriority) =>
    businessAnalysisApi.setPriority(projectKey, priority).then((v) => {
      setBa(v);
      markSaved();
    });

  const pickAttach = () =>
    businessAnalysisApi.pickAttachFile().then((path) => {
      if (path) save('attach_path', path);
    });

  const nonEmptyBoxes = boxes.filter((b) => b.title.trim() || b.text.trim());
  // Newest last in storage; the collapsed view shows the most recent.
  const shown = historyOpen ? [...log].reverse() : log.slice(-1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 8 }}>
      {/* The project's own name is the page title, with the page name as
          a quiet suffix — legacy's window title and header both read
          "<project>  —  Business Analysis" (10452, 10469). The port
          said only "Business Analysis", so six projects opened six
          identical-looking pages. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 'none' }}>
        <span style={{ fontSize: 16, fontWeight: 'bold' }}>
          {project?.name || projectKey.toUpperCase()}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>— Business Analysis</span>
        <span style={{ flex: 1 }} />
        {ba.attach_path ? (
          <button
            onClick={() => businessAnalysisApi.openAttachFile(ba.attach_path)}
            onDoubleClick={() => save('attach_path', '')}
            title="Click to open · double-click to detach"
            style={{ fontSize: 12, height: 24 }}
          >
            + {ba.attach_path.split(/[\\/]/).pop()?.slice(0, 24)}
          </button>
        ) : (
          <button
            onClick={pickAttach}
            title="Link a supporting Word/Excel/CSV file"
            style={{ fontSize: 12, height: 24 }}
          >
            + Attach Word/Excel
          </button>
        )}
        <span
          style={{
            fontSize: 12,
            color: savedAt ? 'var(--success)' : 'var(--text-faint)',
            whiteSpace: 'nowrap',
          }}
        >
          ✓ Saved
        </span>
        {/* No Back button here: the overlay this page opens inside
            already pins one to its top-left corner, and two of them
            three inches apart is the app asking the same question
            twice. Escape still closes it. */}
      </div>

      {/* Two columns, four rows, and the row weights ARE the argument
          about what this page is for: the two analysis cards and the
          people you need get the height, the decision gets none. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 2fr auto 2fr',
          gap: 8,
        }}
      >
        <Card title="IDEA" accent="var(--ba-idea)" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, flex: 1, minHeight: 0 }}>
            <Field label="BUSINESS IDEA" accent="var(--ba-idea)" value={ba.idea_business} onSave={(v) => save('idea_business', v)} onSaved={markSaved} />
            <Field label="PROBLEM IT SOLVES" accent="var(--ba-idea)" value={ba.idea_problem} onSave={(v) => save('idea_problem', v)} onSaved={markSaved} />
            <Field label="TARGET CUSTOMER" accent="var(--ba-idea)" value={ba.idea_customer} onSave={(v) => save('idea_customer', v)} onSaved={markSaved} />
            <Field label="GOAL" accent="var(--ba-idea)" value={ba.idea_goal} onSave={(v) => save('idea_goal', v)} onSaved={markSaved} />
          </div>
        </Card>

        <Card title="ANALYSIS" accent="var(--ba-upside)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            <Field label="MARKET OPPORTUNITY" accent="var(--ba-upside)" value={ba.an_market} onSave={(v) => save('an_market', v)} onSaved={markSaved} />
            <Field label="COMPETITION" accent="var(--ba-upside)" value={ba.an_competition} onSave={(v) => save('an_competition', v)} onSaved={markSaved} />
            <Field label="STRENGTH" accent="var(--ba-upside)" value={ba.an_strength} onSave={(v) => save('an_strength', v)} onSaved={markSaved} />
            <Field label="WEAKNESS / RISK" accent="var(--ba-upside)" value={ba.an_risk} onSave={(v) => save('an_risk', v)} onSaved={markSaved} />
          </div>
        </Card>

        <Card title="FINANCIAL REALITY" accent="var(--ba-money)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            <Field label="INVESTMENT" accent="var(--ba-money)" value={ba.fin_investment} onSave={(v) => save('fin_investment', v)} onSaved={markSaved} />
            <Field label="COST" accent="var(--ba-money)" value={ba.fin_cost} onSave={(v) => save('fin_cost', v)} onSaved={markSaved} />
            <Field label="REVENUE" accent="var(--ba-money)" value={ba.fin_revenue} onSave={(v) => save('fin_revenue', v)} onSaved={markSaved} />
            <Field label="PROFIT" accent="var(--ba-money)" value={ba.fin_profit} onSave={(v) => save('fin_profit', v)} onSaved={markSaved} />
          </div>
        </Card>

        <Card title="DECISION" accent="var(--ba-decide)" style={{ gridColumn: '1 / -1' }}>
          {/* Chips FIRST. The port put "why this decision?" above the
              decision itself, which asks for the reason before the
              judgement it is a reason for. */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {DECISION_STATUSES.map((s) => {
              const on = ba.decision_status === s;
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  aria-pressed={on}
                  style={{
                    flex: 1,
                    height: 32,
                    fontSize: 13,
                    fontWeight: 'bold',
                    letterSpacing: 0.5,
                    background: on ? STATUS_COLOR[s] : `color-mix(in srgb, ${STATUS_COLOR[s]} 10%, var(--surface))`,
                    color: on ? '#FFFFFF' : STATUS_COLOR[s],
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <Field label="WHY THIS DECISION?" accent="var(--ba-decide)" rows={3} value={ba.decision_why} onSave={(v) => save('decision_why', v)} onSaved={markSaved} />

          {/* History, collapsed to its most recent line. Legacy: "on a
              page you open in order to MAKE a decision, the history is
              context, not the task — but it must be visible enough that
              you remember it exists". The port listed all of it. */}
          {log.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              {shown.map((entry) => (
                <div key={entry.id}>
                  {entry.date}&nbsp;&nbsp; {entry.from_status || '—'} → {entry.to_status}
                  {entry.why ? `  ·  ${entry.why.slice(0, 90)}` : ''}
                </div>
              ))}
              {log.length > 1 && (
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  style={{
                    marginTop: 4,
                    height: 24,
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ba-decide)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {historyOpen ? 'hide history' : `${log.length - 1} earlier changes`}
                </button>
              )}
            </div>
          )}
        </Card>

        <Card title="NEXT ACTION" accent="var(--ba-do)">
          <Field label="NEXT MOST IMPORTANT ACTION" accent="var(--ba-do)" value={ba.next_action} onSave={(v) => save('next_action', v)} onSaved={markSaved} />
          {/* Priority and deadline on ONE row under the action, as
              legacy has them (11011) — they are properties of the line
              above, not two more sections. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, flex: 'none' }}>
            <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-muted)', marginRight: 4 }}>
              PRIORITY
            </span>
            {PRIORITIES.map((p) => {
              const on = ba.next_priority === p;
              return (
                <button
                  key={p}
                  onClick={() => togglePriority(p)}
                  aria-pressed={on}
                  style={{
                    height: 24,
                    padding: '0 8px',
                    fontSize: 12,
                    fontWeight: 'bold',
                    background: on ? PRIORITY_COLOR[p] : `color-mix(in srgb, ${PRIORITY_COLOR[p]} 10%, var(--surface))`,
                    color: on ? '#FFFFFF' : PRIORITY_COLOR[p],
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {p}
                </button>
              );
            })}
            <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-muted)', margin: '0 4px 0 16px' }}>
              DEADLINE
            </span>
            <input
              aria-label="Deadline"
              defaultValue={ba.next_deadline}
              onBlur={(e) => save('next_deadline', e.target.value.trim())}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              style={{ fontSize: 12, height: 24, width: 116, padding: '0 4px' }}
            />
          </div>
        </Card>

        <Card title="PEOPLE" accent="var(--ba-decide)">
          <CircleSection projectKey={projectKey} />
        </Card>

        {nonEmptyBoxes.length > 0 && (
          <Card title="LEGACY NOTES (read-only)" accent="var(--ba-neutral)" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, overflowY: 'auto' }}>
              {nonEmptyBoxes.map((b) => (
                <div key={b.box_index} style={{ border: '1px solid var(--border)', padding: 8 }}>
                  {b.title && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{b.title}</div>
                  )}
                  <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{b.text}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

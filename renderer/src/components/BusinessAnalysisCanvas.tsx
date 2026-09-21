import { forwardRef, useEffect, useRef, useState } from 'react';
import CircleSection from './CircleSection';
import { useAutosave } from '../useAutosave';
import { RADIUS } from '../spacing';
import {
  BusinessAnalysis,
  DecisionStatus,
  NextPriority,
  Project,
  ProjectKey,
  businessAnalysisApi,
  projectsApi,
} from '../services/api';

// The Business Decision Canvas — one screen, four stages: IDEA →
// ANALYSIS → DECISION → ACTION. Same data model as before (nothing
// added except next_who/next_when/next_time/next_done_when on NEXT
// ACTION); this pass is a visual-hierarchy pass, not a rewrite.

const PRIORITIES: NextPriority[] = ['HIGH', 'MED', 'LOW'];

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: 'var(--ba-nogo)',
  MED: 'var(--ba-validate)',
  LOW: 'var(--ba-neutral)',
};

// The DECISION card's two rows. Same eight fields as before
// (feelings/thoughts/beliefs/actions × negative/positive) — only the
// labels shrank from full sentences to the single word each row's
// heading already gives context for.
const BLOCKER_FIELDS: {
  field: 'feelings_negative' | 'thoughts_negative' | 'beliefs_negative' | 'actions_negative';
  label: string;
}[] = [
  { field: 'feelings_negative', label: 'FEELING' },
  { field: 'thoughts_negative', label: 'THOUGHT' },
  { field: 'beliefs_negative', label: 'BELIEF' },
  { field: 'actions_negative', label: 'BEHAVIOR' },
];

const REQUIRED_FIELDS: {
  field: 'feelings_positive' | 'thoughts_positive' | 'beliefs_positive' | 'actions_positive';
  label: string;
}[] = [
  { field: 'feelings_positive', label: 'FEELING' },
  { field: 'thoughts_positive', label: 'THOUGHT' },
  { field: 'beliefs_positive', label: 'BELIEF' },
  { field: 'actions_positive', label: 'ACTION' },
];

// PROCEED/TEST FIRST/HOLD/STOP is just GO/VALIDATE/PIVOT/NO-GO under
// new labels — decision_status already existed (kept, unused by the
// old canvas) and its toggle-off-if-already-active engine behavior is
// exactly "user controlled, never auto-decided": clicking sets it,
// clicking the same one again clears it. Each option carries its own
// one-line meaning so the four buttons don't read as four bare words.
const DECISION_OPTIONS: { label: string; value: DecisionStatus; color: string; hint: string }[] = [
  { label: 'PROCEED', value: 'GO', color: 'var(--ba-go)', hint: 'Move forward now — start executing this.' },
  { label: 'TEST FIRST', value: 'VALIDATE', color: 'var(--ba-validate)', hint: 'Run a small test before committing fully.' },
  { label: 'HOLD', value: 'PIVOT', color: 'var(--ba-pivot)', hint: 'Pause and revisit — not ready to act yet.' },
  { label: 'STOP', value: 'NO-GO', color: 'var(--ba-nogo)', hint: 'Do not continue with this idea.' },
];
const DECISION_DEFAULT_HINT = 'Choose how to proceed with this idea.';

const STEPS: { label: string; accent: string }[] = [
  { label: 'IDEA', accent: 'var(--ba-idea)' },
  { label: 'ANALYSIS', accent: 'var(--ba-upside)' },
  { label: 'DECISION', accent: 'var(--ba-decide)' },
  { label: 'ACTION', accent: 'var(--ba-do)' },
];

function Stepper({ done, current, onJump }: { done: boolean[]; current: number; onJump: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {STEPS.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => onJump(i)}
            title={`Jump to ${s.label}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: RADIUS.pill,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                background: done[i] ? 'var(--success)' : i === current ? s.accent : 'transparent',
                color: done[i] ? 'var(--on-success)' : i === current ? s.accent.replace(/\)$/, '-ink)') : 'var(--text-muted)',
                border: done[i] || i === current ? 'none' : '1px solid var(--border)',
              }}
            >
              {done[i] ? '✓' : i + 1}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: i === current ? 700 : 600,
                letterSpacing: 0.5,
                color: i <= current || done[i] ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              {s.label}
            </div>
          </button>
          {i < STEPS.length - 1 && (
            <div style={{ width: 24, height: 2, background: done[i] ? 'var(--success)' : 'var(--border)' }} />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * A labelled autosaving text area — the atom of this page. Label above,
 * text below, one hairline under it, no box.
 */
function Field({
  label,
  value,
  accent,
  rows = 2,
  placeholder,
  big = false,
  onSave,
  onSaved,
}: {
  label: string;
  value: string;
  accent: string;
  rows?: number;
  placeholder?: string;
  /** A bigger, bolder reading size — the one field on the page that
      should read like an answer worth acting on (NEXT ACTION's own
      text), not a note. */
  big?: boolean;
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
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.5,
          color: 'var(--text-muted)',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <textarea
        aria-label={label}
        value={text}
        rows={rows}
        placeholder={placeholder}
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
          fontSize: big ? 16 : 14,
          fontWeight: 600,
          padding: '2px 0',
          border: 'none',
          borderBottom: `1px solid ${focused ? accent : 'var(--border)'}`,
          background: 'transparent',
          color: 'var(--text)',
          resize: 'none',
          outline: 'none',
          // A 1px border-bottom color swap alone was the only focus
          // signal here — too faint to count as WCAG 2.4.7's "visible"
          // indicator on a low-vision pass (UX audit, 2026-09-20). This
          // ring is on top of it, not instead — same accent, more of it.
          boxShadow: focused ? `0 0 0 2px ${accent}55` : 'none',
          borderRadius: RADIUS.control,
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

/** A single free-text amount, set larger and bolder than a normal
    Field — FINANCIAL REALITY's four numbers are the one thing on this
    page meant to be read at a glance, not read word by word. */
function MoneyStat({
  label,
  value,
  accent,
  onSave,
  onSaved,
}: {
  label: string;
  value: string;
  accent: string;
  onSave: (next: string) => void;
  onSaved: () => void;
}) {
  const { value: text, setValue: setText, flush } = useAutosave(value, (v: string) => {
    onSave(v);
    onSaved();
  });
  const [focused, setFocused] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 12,
        borderRadius: RADIUS.card,
        background: `color-mix(in srgb, ${accent} 8%, var(--surface))`,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: 'var(--text-muted)' }}>{label}</div>
      <input
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          flush();
        }}
        style={{
          fontSize: 16,
          fontWeight: 700,
          border: 'none',
          borderBottom: `1px solid ${focused ? accent : 'transparent'}`,
          background: 'transparent',
          color: 'var(--text)',
          outline: 'none',
          boxShadow: focused ? `0 0 0 2px ${accent}55` : 'none',
          borderRadius: RADIUS.control,
          padding: 0,
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

/** A section card: coloured rail, title, body. Takes a ref so the
    stepper can scroll a section into view when the page is squeezed
    shorter than its content. */
const Card = forwardRef<HTMLDivElement, {
  title: string;
  accent: string;
  filled?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}>(function Card({ title, accent, filled = true, children, style }, ref) {
  return (
    <div
      ref={ref}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${filled ? accent : `color-mix(in srgb, ${accent} 30%, var(--border))`}`,
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.5,
          padding: '8px 12px',
          color: filled ? accent : 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
          flex: 'none',
        }}
      >
        {title}
      </div>
      {/* overflow-y:auto is the safety valve for the whole page's "fit
          the screen" rule: the grid row a card sits in is a hard fr
          share of the available height (minmax(0, Nfr) below), so if a
          card's own content ever needs more room than that share, it
          scrolls INSIDE its own border instead of forcing the row
          taller and pushing every card below it off the bottom of the
          window. */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 12px 12px', flex: 1, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
});

const TARGET_RE = /\$[\d][\d,]*(?:\.\d+)?/;

function firstAmount(s: string): number | null {
  const m = (s || '').replace(/,/g, '').match(/\$?(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

export default function BusinessAnalysisCanvas({ projectKey }: { projectKey: ProjectKey }) {
  const [ba, setBa] = useState<BusinessAnalysis | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const [peopleCount, setPeopleCount] = useState(0);
  const sectionRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const jumpTo = (i: number) => sectionRefs[i].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  useEffect(() => {
    businessAnalysisApi.get(projectKey).then(setBa);
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

  const togglePriority = (priority: NextPriority) =>
    businessAnalysisApi.setPriority(projectKey, priority).then((v) => {
      setBa(v);
      markSaved();
    });

  const setDecision = (status: DecisionStatus) =>
    businessAnalysisApi.setDecisionStatus(projectKey, status).then((v) => {
      setBa(v);
      markSaved();
    });

  const pickAttach = () =>
    businessAnalysisApi.pickAttachFile().then((path) => {
      if (path) save('attach_path', path);
    });

  // NEXT ACTION's Start button is the app's existing per-project timer
  // (ProjectDashboard/DeepWorkCard's own start/pause) — not a second
  // task system, just the same switch reached from this screen.
  const toggleAction = () => projectsApi.toggleTimer(projectKey).then(setProject);
  const running = project?.running_since != null;

  const any = (...vals: string[]) => vals.some((v) => (v || '').trim().length > 0);

  const ideaFilled = any(ba.idea_business, ba.idea_problem, ba.idea_customer, ba.idea_goal);
  const analysisFilled = any(ba.an_market, ba.an_competition, ba.an_strength, ba.an_risk);
  const financialFilled = any(ba.fin_investment, ba.fin_cost, ba.fin_revenue, ba.fin_profit);
  const decisionFilled =
    any(
      ba.feelings_negative, ba.feelings_positive,
      ba.thoughts_negative, ba.thoughts_positive,
      ba.beliefs_negative, ba.beliefs_positive,
      ba.actions_negative, ba.actions_positive,
    ) || ba.decision_status !== '';
  const actionFilled = any(ba.next_action);

  const stepsDone = [ideaFilled, analysisFilled || financialFilled, decisionFilled, actionFilled];
  const firstUndone = stepsDone.findIndex((d) => !d);
  const current = firstUndone === -1 ? 3 : firstUndone;

  const targetMatch = ba.idea_goal.match(TARGET_RE);
  const investment = firstAmount(ba.fin_investment);
  const profit = firstAmount(ba.fin_profit);
  const breakEven = investment !== null && profit !== null && profit > 0 ? investment / profit : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 8, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {(project?.name || projectKey).toUpperCase()}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {targetMatch ? `${targetMatch[0]} / MONTH TARGET · ` : ''}Business Decision
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <Stepper done={stepsDone} current={current} onJump={jumpTo} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
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
        {savedAt > 0 && (
          <span style={{ fontSize: 12, color: 'var(--success)', whiteSpace: 'nowrap' }}>✓ Saved</span>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          // minmax(0, Nfr), not bare Nfr — a bare fr track refuses to
          // shrink below its content's min size, which is exactly what
          // pushed every row below ANALYSIS/FINANCIAL off the bottom of
          // the window before: bare 1.4fr for the ANALYSIS+FINANCIAL
          // row grew to fit their combined min-content height even
          // though that was taller than 1.4fr's actual share of the
          // container. minmax(0, …) lets the track shrink and pushes
          // any excess into the Card's own overflow-y:auto instead.
          gridTemplateRows: 'auto minmax(0, 1.6fr) minmax(0, 1.6fr) minmax(0, 1.8fr)',
          gap: 8,
        }}
      >
        <Card ref={sectionRefs[0]} title="IDEA" accent="var(--ba-idea)" filled={ideaFilled} style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, flex: 1, minHeight: 0 }}>
            <Field
              label="BUSINESS IDEA"
              accent="var(--ba-idea)"
              rows={1}
              placeholder="What am I building?"
              value={ba.idea_business}
              onSave={(v) => save('idea_business', v)}
              onSaved={markSaved}
            />
            <Field
              label="PROBLEM"
              accent="var(--ba-idea)"
              rows={1}
              placeholder="What problem does it solve?"
              value={ba.idea_problem}
              onSave={(v) => save('idea_problem', v)}
              onSaved={markSaved}
            />
            <Field
              label="TARGET CUSTOMER"
              accent="var(--ba-idea)"
              rows={1}
              placeholder="Who pays?"
              value={ba.idea_customer}
              onSave={(v) => save('idea_customer', v)}
              onSaved={markSaved}
            />
            <Field
              label="DESIRED OUTCOME"
              accent="var(--ba-idea)"
              rows={1}
              placeholder="What measurable result do I want?"
              value={ba.idea_goal}
              onSave={(v) => save('idea_goal', v)}
              onSaved={markSaved}
            />
          </div>
        </Card>

        <Card ref={sectionRefs[1]} title="ANALYSIS" accent="var(--ba-upside)" filled={analysisFilled}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
            <Field label="MARKET OPPORTUNITY" accent="var(--ba-upside)" rows={1} value={ba.an_market} onSave={(v) => save('an_market', v)} onSaved={markSaved} />
            <Field label="COMPETITION" accent="var(--ba-upside)" rows={1} value={ba.an_competition} onSave={(v) => save('an_competition', v)} onSaved={markSaved} />
            <Field label="STRENGTH" accent="var(--ba-upside)" rows={1} value={ba.an_strength} onSave={(v) => save('an_strength', v)} onSaved={markSaved} />
            <Field label="WEAKNESS / RISK" accent="var(--ba-upside)" rows={1} value={ba.an_risk} onSave={(v) => save('an_risk', v)} onSaved={markSaved} />
          </div>
        </Card>

        <Card title="FINANCIAL REALITY" accent="var(--ba-money)" filled={financialFilled}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1, minHeight: 0, alignContent: 'start' }}>
            <MoneyStat label="INVESTMENT" accent="var(--ba-money)" value={ba.fin_investment} onSave={(v) => save('fin_investment', v)} onSaved={markSaved} />
            <MoneyStat label="REVENUE" accent="var(--ba-upside)" value={ba.fin_revenue} onSave={(v) => save('fin_revenue', v)} onSaved={markSaved} />
            <MoneyStat label="COST" accent="var(--danger)" value={ba.fin_cost} onSave={(v) => save('fin_cost', v)} onSaved={markSaved} />
            <MoneyStat label="PROFIT" accent="var(--ba-decide)" value={ba.fin_profit} onSave={(v) => save('fin_profit', v)} onSaved={markSaved} />
            <div
              style={{
                gridColumn: '1 / -1',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                fontWeight: 600,
                color: breakEven !== null ? 'var(--text)' : 'var(--text-muted)',
                padding: 8,
                borderRadius: RADIUS.card,
                background: 'color-mix(in srgb, var(--ba-money) 8%, var(--surface))',
              }}
            >
              <span style={{ letterSpacing: 0.5, color: 'var(--text-muted)' }}>BREAK-EVEN</span>
              <span>
                {breakEven !== null && Number.isFinite(breakEven)
                  ? `${breakEven.toFixed(1)} months`
                  : 'Add investment & profit to calculate'}
              </span>
            </div>
          </div>
        </Card>

        <div ref={sectionRefs[2]} style={{ display: 'flex', gap: 8, gridColumn: '1 / -1', minHeight: 0 }}>
          <Card title="DECISION" accent="var(--ba-decide)" filled={decisionFilled} style={{ flex: 2, minWidth: 0 }}>
            {/* Both rows are flex-shrink:0 and the wrapper scrolls instead
                of shrinking below their content height — a squeezed row
                here used to bleed its border past the box edge and cross
                straight through the "REQUIRED STATE" label under it. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--danger)' }}>
                  CURRENT BLOCKERS
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 16,
                    padding: 8,
                    borderRadius: RADIUS.card,
                    background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
                  }}
                >
                  {BLOCKER_FIELDS.map((f) => (
                    <Field
                      key={f.field}
                      label={f.label}
                      accent="var(--danger)"
                      rows={1}
                      value={ba[f.field]}
                      onSave={(v) => save(f.field, v)}
                      onSaved={markSaved}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--success)' }}>
                  REQUIRED STATE
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 16,
                    padding: 8,
                    borderRadius: RADIUS.card,
                    background: 'color-mix(in srgb, var(--success) 8%, transparent)',
                  }}
                >
                  {REQUIRED_FIELDS.map((f) => (
                    <Field
                      key={f.field}
                      label={f.label}
                      accent="var(--success)"
                      rows={1}
                      value={ba[f.field]}
                      onSave={(v) => save(f.field, v)}
                      onSaved={markSaved}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card title="DECISION" accent="var(--ba-decide)" filled={ba.decision_status !== ''} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {DECISION_OPTIONS.map((opt) => {
                  const on = ba.decision_status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setDecision(opt.value)}
                      aria-pressed={on}
                      style={{
                        height: 28,
                        padding: '0 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: RADIUS.control,
                        border: `1px solid ${opt.color}`,
                        background: on ? opt.color : 'transparent',
                        color: on ? opt.color.replace(/\)$/, '-ink)') : opt.color,
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', flex: 'none' }}>
                {DECISION_OPTIONS.find((o) => o.value === ba.decision_status)?.hint ?? DECISION_DEFAULT_HINT}
              </div>
              <Field
                label="REASON"
                accent="var(--ba-decide)"
                rows={4}
                value={ba.decision_why}
                onSave={(v) => save('decision_why', v)}
                onSaved={markSaved}
              />
            </div>
          </Card>
        </div>

        <Card
          ref={sectionRefs[3]}
          title="NEXT ACTION"
          accent="var(--ba-do)"
          filled={actionFilled}
          style={{ background: 'color-mix(in srgb, var(--ba-do) 6%, var(--surface))' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
            <Field
              label="NEXT MOST IMPORTANT ACTION"
              accent="var(--ba-do)"
              big
              value={ba.next_action}
              onSave={(v) => save('next_action', v)}
              onSaved={markSaved}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, flex: 'none' }}>
              <Field label="WHO" accent="var(--ba-do)" rows={1} value={ba.next_who} onSave={(v) => save('next_who', v)} onSaved={markSaved} />
              <Field label="WHEN" accent="var(--ba-do)" rows={1} value={ba.next_when} onSave={(v) => save('next_when', v)} onSaved={markSaved} />
              <Field label="TIME" accent="var(--ba-do)" rows={1} value={ba.next_time} onSave={(v) => save('next_time', v)} onSaved={markSaved} />
              <Field label="DONE WHEN" accent="var(--ba-do)" rows={1} value={ba.next_done_when} onSave={(v) => save('next_done_when', v)} onSaved={markSaved} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginRight: 4 }}>
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
                      fontWeight: 700,
                      background: on ? PRIORITY_COLOR[p] : `color-mix(in srgb, ${PRIORITY_COLOR[p]} 10%, var(--surface))`,
                      color: on ? PRIORITY_COLOR[p].replace(/\)$/, '-ink)') : PRIORITY_COLOR[p],
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {p}
                  </button>
                );
              })}
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '0 4px 0 16px' }}>
                DEADLINE
              </span>
              <input
                aria-label="Deadline"
                defaultValue={ba.next_deadline}
                onBlur={(e) => save('next_deadline', e.target.value.trim())}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                style={{ fontSize: 12, height: 24, width: 116, padding: '0 4px' }}
              />
              <span style={{ flex: 1 }} />
              <button
                onClick={toggleAction}
                style={{
                  height: 32,
                  padding: '0 24px',
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  borderRadius: RADIUS.control,
                  border: 'none',
                  background: running ? 'var(--danger)' : 'var(--ba-do)',
                  color: running ? 'var(--on-danger)' : 'var(--ba-do-ink)',
                  cursor: 'pointer',
                }}
              >
                {running ? '■ PAUSE ACTION' : '▶ START ACTION'}
              </button>
            </div>
          </div>
        </Card>

        <Card title="PEOPLE" accent="var(--ba-decide)" filled={peopleCount > 0}>
          <CircleSection projectKey={projectKey} onCount={setPeopleCount} />
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import CircleSection from './CircleSection';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import {
  BusinessAnalysis,
  DecisionLogEntry,
  DecisionStatus,
  LegacyBox,
  NextPriority,
  ProjectKey,
  businessAnalysisApi,
} from '../services/api';

const DECISION_STATUSES: DecisionStatus[] = ['GO', 'VALIDATE', 'PIVOT', 'NO-GO'];
const PRIORITIES: NextPriority[] = ['HIGH', 'MED', 'LOW'];

// Matches legacy exactly (task_tracker_v3_THEMES.py lines 10763-10767,
// 11019-11020) — a fixed palette reused unchanged across every theme,
// unlike the rest of the app's theme-varying tokens (see themes.ts).
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

function Field({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (next: string) => void;
}) {
  const { value: text, setValue: setText, flush, state } = useAutosave(value, onSave);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 3 }}>{label}</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={flush}
        rows={2}
        style={{ width: '100%', fontSize: 13, padding: 6, resize: 'vertical', boxSizing: 'border-box', ...savedFlashStyle(state) }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, opacity: 0.8 }}>{title}</div>
      {children}
    </div>
  );
}

export default function BusinessAnalysisCanvas({
  projectKey,
  onClose,
}: {
  projectKey: ProjectKey;
  onClose: () => void;
}) {
  const [ba, setBa] = useState<BusinessAnalysis | null>(null);
  const [log, setLog] = useState<DecisionLogEntry[]>([]);
  const [boxes, setBoxes] = useState<LegacyBox[]>([]);

  const refresh = () => {
    businessAnalysisApi.get(projectKey).then(setBa);
    businessAnalysisApi.getLog(projectKey).then(setLog);
  };

  useEffect(() => {
    refresh();
    businessAnalysisApi.getLegacyBoxes(projectKey).then(setBoxes);
  }, [projectKey]);

  if (!ba) return <div>Loading…</div>;

  const save = (field: keyof BusinessAnalysis, value: string) =>
    businessAnalysisApi.update(projectKey, { [field]: value }).then(setBa);

  const toggleStatus = (status: DecisionStatus) =>
    businessAnalysisApi.setDecisionStatus(projectKey, status).then((updated) => {
      setBa(updated);
      businessAnalysisApi.getLog(projectKey).then(setLog);
    });

  const togglePriority = (priority: NextPriority) =>
    businessAnalysisApi.setPriority(projectKey, priority).then(setBa);

  const pickAttach = () =>
    businessAnalysisApi.pickAttachFile().then((path) => {
      if (path) save('attach_path', path);
    });
  const openAttach = () => businessAnalysisApi.openAttachFile(ba.attach_path);
  const detachFile = () => save('attach_path', '');

  const nonEmptyBoxes = boxes.filter((b) => b.title.trim() || b.text.trim());

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 'bold' }}>Business Analysis</div>
        {ba.attach_path ? (
          <button
            onClick={openAttach}
            onDoubleClick={detachFile}
            title="Click to open · double-click to detach"
            style={{ fontSize: 11, marginRight: 8 }}
          >
            + {ba.attach_path.split(/[\\/]/).pop()?.slice(0, 24)}
          </button>
        ) : (
          <button onClick={pickAttach} title="Link a supporting Word/Excel/CSV file" style={{ fontSize: 11, marginRight: 8 }}>
            + Attach Word/Excel
          </button>
        )}
        <button onClick={onClose}>← Back</button>
      </div>

      <Section title="IDEA">
        <Field label="BUSINESS IDEA" value={ba.idea_business} onSave={(v) => save('idea_business', v)} />
        <Field label="PROBLEM IT SOLVES" value={ba.idea_problem} onSave={(v) => save('idea_problem', v)} />
        <Field label="TARGET CUSTOMER" value={ba.idea_customer} onSave={(v) => save('idea_customer', v)} />
        <Field label="GOAL" value={ba.idea_goal} onSave={(v) => save('idea_goal', v)} />
      </Section>

      <Section title="ANALYSIS">
        <Field label="MARKET OPPORTUNITY" value={ba.an_market} onSave={(v) => save('an_market', v)} />
        <Field label="COMPETITION" value={ba.an_competition} onSave={(v) => save('an_competition', v)} />
        <Field label="STRENGTH" value={ba.an_strength} onSave={(v) => save('an_strength', v)} />
        <Field label="WEAKNESS / RISK" value={ba.an_risk} onSave={(v) => save('an_risk', v)} />
      </Section>

      <Section title="FINANCIAL">
        <Field label="INVESTMENT" value={ba.fin_investment} onSave={(v) => save('fin_investment', v)} />
        <Field label="COST" value={ba.fin_cost} onSave={(v) => save('fin_cost', v)} />
        <Field label="REVENUE" value={ba.fin_revenue} onSave={(v) => save('fin_revenue', v)} />
        <Field label="PROFIT" value={ba.fin_profit} onSave={(v) => save('fin_profit', v)} />
      </Section>

      <Section title="DECISION">
        <Field label="WHY THIS DECISION?" value={ba.decision_why} onSave={(v) => save('decision_why', v)} />
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {DECISION_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              style={{
                flex: 1,
                padding: '6px 4px',
                fontSize: 12,
                fontWeight: ba.decision_status === s ? 'bold' : 'normal',
                background: ba.decision_status === s ? STATUS_COLOR[s] : 'transparent',
                color: ba.decision_status === s ? '#fff' : 'inherit',
                border: `1px solid ${STATUS_COLOR[s]}`,
                borderRadius: 4,
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {log.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px 0', fontSize: 12 }}>
            {log.map((entry) => (
              <li key={entry.id} style={{ padding: '3px 0', opacity: 0.75 }}>
                {entry.date}: {entry.from_status} → {entry.to_status}
                {entry.why && ` — ${entry.why}`}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="NEXT">
        <Field label="NEXT MOST IMPORTANT ACTION" value={ba.next_action} onSave={(v) => save('next_action', v)} />
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => togglePriority(p)}
              style={{
                flex: 1,
                padding: '6px 4px',
                fontSize: 12,
                fontWeight: ba.next_priority === p ? 'bold' : 'normal',
                background: ba.next_priority === p ? PRIORITY_COLOR[p] : 'transparent',
                color: ba.next_priority === p ? '#fff' : 'inherit',
                border: `1px solid ${PRIORITY_COLOR[p]}`,
                borderRadius: 4,
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <Field label="DEADLINE" value={ba.next_deadline} onSave={(v) => save('next_deadline', v)} />
      </Section>

      {nonEmptyBoxes.length > 0 && (
        <Section title="LEGACY NOTES (read-only)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {nonEmptyBoxes.map((b) => (
              <div key={b.box_index} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: 8 }}>
                {b.title && <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{b.title}</div>}
                <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{b.text}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
      <CircleSection projectKey={projectKey} />
    </div>
  );
}

import { useEffect, useState } from 'react';
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

const STATUS_COLOR: Record<string, string> = {
  GO: '#2D6A4F',
  VALIDATE: '#B08900',
  PIVOT: '#B0590A',
  'NO-GO': '#C0392B',
};

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: '#C0392B',
  MED: '#B08900',
  LOW: '#2D6A4F',
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
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 3 }}>{label}</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onSave(text)}
        rows={2}
        style={{ width: '100%', fontSize: 13, padding: 6, resize: 'vertical', boxSizing: 'border-box' }}
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

  const nonEmptyBoxes = boxes.filter((b) => b.title.trim() || b.text.trim());

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 'bold' }}>Business Analysis</div>
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
              <div key={b.box_index} style={{ border: '1px solid #8883', borderRadius: 4, padding: 8 }}>
                {b.title && <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{b.title}</div>}
                <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{b.text}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

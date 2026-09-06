import { useEffect, useState } from 'react';
import { Q90Area, Q90Field, Q90Panel, quarterlyApi } from '../services/api';

const PROMPTS: { field: Q90Field; question: (n: number) => string; hint: string; rows: number }[] = [
  {
    field: 'out',
    question: (n) => `In ${n} days, what is measurably true?`,
    hint: 'A number or a yes/no. Not "better" — "72kg", "visa submitted".',
    rows: 4,
  },
  {
    field: 'act',
    question: () => 'The ONE thing you repeat every week',
    hint: 'The behaviour, not the wish. Small enough for your worst week.',
    rows: 4,
  },
  {
    field: 'ifthen',
    question: () => 'When it goes wrong, what will you do?',
    hint: 'Name what usually stops you, and decide the answer now.',
    rows: 2,
  },
];

const PRESETS = [30, 60, 90];
const CYCLE_MIN = 7;
const CYCLE_MAX = 365;

function clip(text: string, max: number): string {
  const collapsed = text.split(/\s+/).filter(Boolean).join(' ');
  if (!collapsed) return '— not set yet';
  return collapsed.length > max ? collapsed.slice(0, max - 1) + '…' : collapsed;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function CycleEditor({ panel, onSet, onClose }: { panel: Q90Panel; onSet: (start: string, days: number) => void; onClose: () => void }) {
  const [len, setLen] = useState(String(panel.cycle_days));
  const [start, setStart] = useState(panel.cycle_start);

  const submit = () => {
    const n = Math.max(CYCLE_MIN, Math.min(CYCLE_MAX, parseInt(len, 10) || 90));
    onSet(start, n);
    onClose();
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12, background: 'var(--surface)' }}>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>HOW LONG IS ONE CYCLE?</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setLen(String(p))}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              background: String(p) === len ? 'var(--accent)' : undefined,
              color: String(p) === len ? '#fff' : undefined,
            }}
          >
            {p}
          </button>
        ))}
        <input
          type="number"
          value={len}
          onChange={(e) => setLen(e.target.value)}
          min={CYCLE_MIN}
          max={CYCLE_MAX}
          style={{ width: 70, fontSize: 12, padding: 4 }}
        />
        <span style={{ fontSize: 11, opacity: 0.6, alignSelf: 'center' }}>days</span>
      </div>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>STARTS ON</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ fontSize: 12, padding: 4 }} />
        <button onClick={submit} style={{ fontSize: 12, fontWeight: 'bold' }}>
          Set cycle
        </button>
        <button onClick={onClose} style={{ fontSize: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AreaAccordion({
  area,
  cycleDays,
  isOpen,
  onToggle,
  onSave,
}: {
  area: Q90Area;
  cycleDays: number;
  isOpen: boolean;
  onToggle: () => void;
  onSave: (field: Q90Field, text: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<Q90Field, string>>({ out: area.out, act: area.act, ifthen: area.ifthen });
  useEffect(() => setDrafts({ out: area.out, act: area.act, ifthen: area.ifthen }), [area.out, area.act, area.ifthen]);

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 6,
        marginBottom: 6,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 10px',
          border: 'none',
          borderRadius: 0,
          cursor: 'pointer',
          background: 'var(--surface)',
          color: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 11, opacity: 0.6, width: 12 }}>{isOpen ? '▾' : '▸'}</span>
        <span style={{ fontSize: 14 }}>{area.glyph}</span>
        <span style={{ fontWeight: 'bold', fontSize: 13, flex: 1 }}>{area.label}</span>
        {!isOpen && <span style={{ fontSize: 11, opacity: 0.6 }}>{clip(area.out, 46)}</span>}
      </button>
      {isOpen && (
        <div style={{ padding: '4px 12px 12px' }}>
          <p style={{ fontSize: 11, opacity: 0.6, margin: '0 0 8px' }}>{area.description}</p>
          {PROMPTS.map((p) => (
            <div key={p.field} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 2 }}>{p.question(cycleDays)}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{p.hint}</div>
              <textarea
                value={drafts[p.field]}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.field]: e.target.value }))}
                onBlur={() => drafts[p.field] !== area[p.field] && onSave(p.field, drafts[p.field])}
                rows={p.rows}
                style={{ width: '100%', fontSize: 13, padding: 6, boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QuarterlyPlanPanel() {
  const [panel, setPanel] = useState<Q90Panel | null>(null);
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [editingCycle, setEditingCycle] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  const refresh = () => quarterlyApi.getPanel().then(setPanel);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (panel && !autoOpened) {
      // Open the first area with nothing in it — the next thing to do,
      // rather than always the first row. Matches legacy exactly.
      const first = panel.areas.find((a) => !a.out.trim());
      setOpenArea(first ? first.key : panel.areas[0].key);
      setAutoOpened(true);
    }
  }, [panel, autoOpened]);

  if (!panel) return <div>Loading…</div>;

  const when =
    panel.day === 0
      ? `starts in ${panel.days_left - panel.cycle_days} days`
      : `day ${panel.day} of ${panel.cycle_days}, ${panel.days_left} left`;

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{panel.cycle_days}-DAY PLAN</h2>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          {panel.areas_done}/{panel.areas_total} areas set
        </span>
      </div>
      <button
        onClick={() => setEditingCycle((v) => !v)}
        style={{
          display: 'block',
          textAlign: 'left',
          fontSize: 12,
          opacity: 0.7,
          border: 'none',
          background: 'transparent',
          padding: '4px 0 12px',
          cursor: 'pointer',
        }}
        title="Change the start date or the length"
      >
        {formatDate(panel.cycle_start)} → {formatDate(panel.cycle_end)} · {when} ✎
      </button>

      {editingCycle && (
        <CycleEditor
          panel={panel}
          onClose={() => setEditingCycle(false)}
          onSet={(start, days) => quarterlyApi.setCycle(start, days).then(setPanel)}
        />
      )}

      {panel.areas.map((area) => (
        <AreaAccordion
          key={area.key}
          area={area}
          cycleDays={panel.cycle_days}
          isOpen={openArea === area.key}
          onToggle={() => setOpenArea(openArea === area.key ? null : area.key)}
          onSave={(field, text) => quarterlyApi.setAnswer(area.key, field, text).then(refresh)}
        />
      ))}
    </div>
  );
}

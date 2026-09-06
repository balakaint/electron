import { useEffect, useState } from 'react';
import { DaySummary, Habit, HabitCategory, MonthlyReport, WeekScore, habitsApi } from '../services/api';
import WeeklyScoreChart from './WeeklyScoreChart';

// Matches legacy's own per-theme _VB dict for this screen exactly
// (task_tracker_v3_THEMES.py lines 16660-16702) — see themes.ts's
// --habit-* comment for why these differ from the app-wide tokens.
const CATEGORIES: { key: HabitCategory; label: string; color: string }[] = [
  { key: 'money', label: 'Money', color: 'var(--habit-money)' },
  { key: 'health', label: 'Health', color: 'var(--habit-health)' },
  { key: 'relation', label: 'Relation', color: 'var(--habit-relation)' },
  { key: 'mind', label: 'Mindset', color: 'var(--habit-mind)' },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY = todayIso();

// Color-coded ring gauge, matching legacy's _draw_score_ring (there
// approximated with 1-degree line segments since Tk has no native arc
// with round caps — an SVG stroke-dasharray does the same job natively).
function ScoreRing({ score }: { score: number }) {
  const r = 32;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const color = score >= 70 ? 'var(--habit-success)' : score >= 40 ? 'var(--habit-warning)' : 'var(--habit-danger)';
  return (
    <svg width={80} height={80} viewBox="0 0 80 80">
      <circle cx={40} cy={40} r={r} fill="none" stroke="var(--border)" strokeWidth={6} />
      {score > 0 && (
        <circle
          cx={40}
          cy={40}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 40 40)"
        />
      )}
      <text x={40} y={38} textAnchor="middle" fontSize={20} fontWeight="bold" fill="var(--text)">
        {score}
      </text>
      <text x={40} y={52} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
        /100
      </text>
    </svg>
  );
}

export default function HabitDashboard() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [streak, setStreak] = useState(0);
  const [week, setWeek] = useState<WeekScore[]>([]);
  const [intention, setIntentionText] = useState('');
  const [win, setWin] = useState('');
  const [reflection, setReflection] = useState('');
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null);
  const [newHabit, setNewHabit] = useState<Record<string, string>>({});

  const refresh = () => {
    habitsApi.list(TODAY).then(setHabits);
    habitsApi.summary(TODAY).then(setSummary);
    habitsApi.streak().then((r) => setStreak(r.streak));
    habitsApi.week().then(setWeek);
    habitsApi.monthlyReport().then(setMonthly);
  };

  useEffect(() => {
    refresh();
    habitsApi.getIntention(TODAY).then((r) => setIntentionText(r.text));
    habitsApi.getWin(TODAY).then((r) => setWin(r.win));
    habitsApi.getReflection(TODAY).then((r) => setReflection(r.reflection));
  }, []);

  const saveIntention = () => {
    habitsApi.setIntention(TODAY, intention);
  };

  const saveWin = () => {
    habitsApi.setWin(TODAY, win);
  };

  const saveReflection = () => {
    habitsApi.setReflection(TODAY, reflection);
  };

  // Past 6pm with a bad score, name what's left rather than just the
  // percentage — matches legacy's alert_lbl. A perfect day still gets
  // its own line regardless of the hour, since that's worth saying too.
  const score = summary?.score ?? 0;
  const remaining = habits.filter((h) => !h.done).length;
  const hour = new Date().getHours();
  const alertText = hour >= 18 && score < 50 ? `⚠ ${remaining} habits remaining!` : score === 100 ? '✓ Perfect Day' : '';

  const addHabit = (cat: HabitCategory) => {
    const name = (newHabit[cat] || '').trim();
    if (!name) return;
    habitsApi.create(cat, name).then(() => {
      setNewHabit((s) => ({ ...s, [cat]: '' }));
      refresh();
    });
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <ScoreRing score={score} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, opacity: 0.7, whiteSpace: 'nowrap' }}>◎ TODAY I WILL:</span>
            <input
              value={intention}
              onChange={(e) => setIntentionText(e.target.value)}
              onBlur={saveIntention}
              onKeyDown={(e) => e.key === 'Enter' && saveIntention()}
              placeholder="Today I will…"
              style={{ flex: 1, padding: 6 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, opacity: 0.7, whiteSpace: 'nowrap', color: 'var(--habit-success)' }}>◈ TODAY'S WIN:</span>
            <input
              value={win}
              onChange={(e) => setWin(e.target.value)}
              onBlur={saveWin}
              onKeyDown={(e) => e.key === 'Enter' && saveWin()}
              placeholder="What went well today?"
              style={{ flex: 1, padding: 6 }}
            />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--habit-warning)' }}>🔥 {streak} days</div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>STREAK</div>
          {alertText && (
            <div style={{ fontSize: 11, marginTop: 4, color: alertText.startsWith('⚠') ? 'var(--habit-danger)' : 'var(--habit-success)' }}>
              {alertText}
            </div>
          )}
        </div>
      </div>

      <WeeklyScoreChart week={week} today={TODAY} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {CATEGORIES.map(({ key, label, color }) => {
          const catHabits = habits.filter((h) => h.category === key);
          const catSummary = summary?.categories?.[key];
          return (
            <div key={key} style={{ border: `1px solid ${color}55`, borderRadius: 8, padding: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color,
                  fontWeight: 'bold',
                  marginBottom: 8,
                }}
              >
                <span>{label}</span>
                <span>{catSummary ? `${catSummary.done}/${catSummary.total}` : ''}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {catHabits.map((h) => (
                  <li key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                    <button
                      onClick={() => habitsApi.toggle(h.id, TODAY).then(refresh)}
                      title="Toggle done"
                      style={{ width: 20 }}
                    >
                      {h.done ? '✓' : '○'}
                    </button>
                    <span style={{ flex: 1, fontSize: 13 }}>{h.name}</span>
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <input
                  value={newHabit[key] || ''}
                  onChange={(e) => setNewHabit((s) => ({ ...s, [key]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addHabit(key)}
                  placeholder="Add habit…"
                  style={{ flex: 1, fontSize: 12, padding: 4 }}
                />
                <button onClick={() => addHabit(key)} title="Add habit">+</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', opacity: 0.8, marginBottom: 8 }}>📝 END OF DAY REFLECTION</div>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            onBlur={saveReflection}
            rows={5}
            placeholder="What did you accomplish today? What will you improve tomorrow?"
            style={{ width: '100%', fontSize: 13, padding: 8, resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', opacity: 0.8, marginBottom: 8 }}>📅 MONTHLY REPORT</div>
          {monthly && (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 8, fontSize: 13 }}>
              <span style={{ opacity: 0.6 }}>Avg Score:</span>
              <span style={{ fontWeight: 'bold' }}>{monthly.avg_score}/100</span>
              <span style={{ opacity: 0.6 }}>Streak:</span>
              <span style={{ fontWeight: 'bold', color: 'var(--habit-warning)' }}>🔥 {monthly.streak} days</span>
              <span style={{ opacity: 0.6 }}>Days Done:</span>
              <span style={{ fontWeight: 'bold' }}>{monthly.days_done}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

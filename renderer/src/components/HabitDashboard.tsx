import { useEffect, useState } from 'react';
import { DaySummary, Habit, HabitCategory, WeekScore, habitsApi } from '../services/api';

const CATEGORIES: { key: HabitCategory; label: string; color: string }[] = [
  { key: 'money', label: 'Money', color: '#185FA5' },
  { key: 'health', label: 'Health', color: '#2D6A4F' },
  { key: 'relation', label: 'Relation', color: '#8B5E1A' },
  { key: 'mind', label: 'Mindset', color: '#5B21B6' },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY = todayIso();

export default function HabitDashboard() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [streak, setStreak] = useState(0);
  const [week, setWeek] = useState<WeekScore[]>([]);
  const [intention, setIntentionText] = useState('');
  const [newHabit, setNewHabit] = useState<Record<string, string>>({});

  const refresh = () => {
    habitsApi.list(TODAY).then(setHabits);
    habitsApi.summary(TODAY).then(setSummary);
    habitsApi.streak().then((r) => setStreak(r.streak));
    habitsApi.week().then(setWeek);
  };

  useEffect(() => {
    refresh();
    habitsApi.getIntention(TODAY).then((r) => setIntentionText(r.text));
  }, []);

  const saveIntention = () => {
    habitsApi.setIntention(TODAY, intention);
  };

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 36, fontWeight: 'bold' }}>{summary?.score ?? 0}%</div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>Today's score</div>
          <div style={{ fontSize: 14 }}>🔥 {streak}-day streak</div>
        </div>
        <input
          value={intention}
          onChange={(e) => setIntentionText(e.target.value)}
          onBlur={saveIntention}
          onKeyDown={(e) => e.key === 'Enter' && saveIntention()}
          placeholder="Today I will…"
          style={{ flex: 1, padding: 8 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {week.map((w) => (
          <div key={w.day} style={{ textAlign: 'center', flex: 1 }}>
            <div
              style={{
                height: 40,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 16,
                  height: Math.max(2, (w.pct / 100) * 40),
                  background: '#2D6A4F',
                  opacity: w.day === TODAY ? 1 : 0.5,
                }}
              />
            </div>
            <div style={{ fontSize: 10, opacity: 0.6 }}>{w.label}</div>
          </div>
        ))}
      </div>

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
                <button onClick={() => addHabit(key)}>+</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

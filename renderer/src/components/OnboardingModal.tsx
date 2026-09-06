import { useState } from 'react';
import { settingsApi } from '../services/api';

const STEPS = [
  {
    icon: '📋',
    title: 'Tasks, Habits, Projects',
    body: 'Three tabs across the top. Plan/Focus splits your task list; Habits tracks daily checklists; Projects holds your six fixed slots with timers and business analysis.',
  },
  {
    icon: '⏱',
    title: 'Timers and themes',
    body: 'Every project and task can track its own time — click ▶ to start, ▶ again to stop. Cycle the app theme any time from the header.',
  },
  {
    icon: '⌨',
    title: 'Shortcuts and autosave',
    body: 'Ctrl+Z undoes your last action, Ctrl+T cycles the theme, and F1 or ? opens this shortcut list again. Everything saves itself the moment you change it.',
  },
];

export default function OnboardingModal({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  const finish = () => {
    settingsApi.setOnboarded().finally(onDone);
  };

  const go = (delta: number) => {
    const next = step + delta;
    if (next < 0) return;
    if (next >= STEPS.length) {
      finish();
      return;
    }
    setStep(next);
  };

  const current = STEPS[step];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        style={{
          background: 'var(--surface, #fff)',
          color: 'var(--text, #111)',
          border: '1px solid var(--border, #ccc)',
          borderRadius: 10,
          padding: 28,
          width: 360,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>{current.icon}</div>
        <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>{current.title}</h2>
        <p style={{ margin: '0 0 20px 0', fontSize: 14, opacity: 0.8, lineHeight: 1.5 }}>{current.body}</p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                background: i === step ? 'var(--accent, #4f8cff)' : 'var(--border, #ccc)',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={() => go(-1)} disabled={step === 0}>
            Back
          </button>
          <button onClick={() => go(1)}>{isLast ? 'Get Started ✓' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

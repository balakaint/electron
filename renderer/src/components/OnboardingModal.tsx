import { useState } from 'react';
import { Check, ClipboardList, Keyboard, Timer } from 'lucide-react';
import { settingsApi } from '../services/api';
import { RADIUS } from '../spacing';
import { useFocusTrap } from '../hooks/useFocusTrap';

const STEPS = [
  {
    Icon: ClipboardList,
    title: 'Three columns, one flow',
    body: 'Projects on the left hold quick notes, tasks, and per-project Goals/Analysis/Journey tabs. The middle column is Goals — weekly, monthly, yearly — for whichever project is selected.',
  },
  {
    Icon: Timer,
    title: 'Timers and themes',
    body: 'Every project and task can track its own time — click ▶ to start, ▶ again to stop. Cycle the app theme any time from the header.',
  },
  {
    Icon: Keyboard,
    title: 'Execute your day',
    body: 'The right column\'s PLAN/EXECUTE toggle plans hours, picks your top 3, tracks tasks, and holds quick notes. Ctrl+Z undoes, Ctrl+T cycles the theme, F1 or ? reopens shortcuts. Everything autosaves.',
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
  const dialogRef = useFocusTrap<HTMLDivElement>(true);

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
        style={{
          background: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: RADIUS.card,
          padding: 32,
          width: 360,
          textAlign: 'center',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <current.Icon size={30} />
        </div>
        {/* No role/aria-modal before this — axe's "region" rule (content
            must sit in a landmark) was really pointing at a real gap: a
            modal blocking the whole screen with no dialog semantics at
            all reads to a screen reader as page content, not a dialog it
            can announce and trap focus in. */}
        <h2 id="onboarding-title" style={{ margin: '0 0 12px 0', fontSize: 16 }}>{current.title}</h2>
        <p style={{ margin: '0 0 24px 0', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>{current.body}</p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: RADIUS.control,
                background: i === step ? 'var(--accent)' : 'var(--border)',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={() => go(-1)} disabled={step === 0}>
            Back
          </button>
          <button onClick={() => go(1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {isLast ? <><Check size={13} /> Get Started</> : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Settings, SettingsPatch, settingsApi } from '../services/api';
import { THEME_LABELS, THEME_ORDER, Theme, themeSwatch } from '../themes';
import { RADIUS } from '../spacing';
import { useFocusTrap } from '../hooks/useFocusTrap';

const APP_VERSION = '0.1.0';
const APP_CONTACT = 'balakaint@gmail.com';

function formatPhase(hour: number): string {
  const h12 = hour % 12 || 12;
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

type Tab = 'look' | 'time' | 'day' | 'system' | 'about';

const TABS: [Tab, string, string][] = [
  ['look', '◐', 'Appearance'],
  ['time', '⏱', 'Time & goal'],
  ['day', '☀', 'Your day'],
  ['system', '⚙', 'Data & system'],
  ['about', 'ⓘ', 'About'],
];

const sub: React.CSSProperties = { fontSize: 12, color: 'var(--text-faint)' };
const heading: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: 'var(--text-faint)',
};
const plainBtn: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  fontSize: 12,
  border: '1px solid var(--border)',
  borderRadius: RADIUS.control,
  background: 'var(--surface)',
  color: 'var(--text)',
  cursor: 'pointer',
};

// A setting's name with one line on what it does, and its control on
// the right — every row in the dialog reads the same way.
function Row({ label, hint, children, dim }: { label: React.ReactNode; hint?: string; children: React.ReactNode; dim?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        opacity: dim ? 0.6 : 1,
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        {hint && <span style={sub}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      style={{
        width: 40,
        height: 22,
        flexShrink: 0,
        borderRadius: RADIUS.pill,
        border: '1px solid var(--border)',
        background: on ? 'var(--accent)' : 'transparent',
        position: 'relative',
        cursor: disabled ? 'default' : 'pointer',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 1,
          left: on ? 19 : 1,
          width: 18,
          height: 18,
          borderRadius: RADIUS.pill,
          background: on ? 'var(--on-accent)' : 'var(--text-muted)',
          transition: 'left 0.12s',
        }}
      />
    </button>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  label: string;
}) {
  const step: React.CSSProperties = {
    ...plainBtn,
    width: 28,
    padding: 0,
    fontSize: 14,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Earlier / less: ${label}`}
        style={step}
      >
        −
      </button>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          minWidth: 72,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {format(value)}
      </span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Later / more: ${label}`} style={step}>
        +
      </button>
    </div>
  );
}

// Each theme as a small picture of itself — page, card, accent and text
// in its own colours — so the choice is made by eye, not by name.
function ThemePicker({ value, onSelect }: { value: Theme; onSelect: (t: Theme) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 8,
      }}
    >
      {THEME_ORDER.map((t) => {
        const on = t === value;
        const [bg, surface, accent, text] = themeSwatch(t);
        return (
          <button
            key={t}
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(t)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 8,
              border: `2px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: RADIUS.card,
              background: 'var(--surface)',
              color: 'var(--text)',
              cursor: 'pointer',
              font: 'inherit',
              textAlign: 'left',
            }}
          >
            {/* The border keeps a near-white page visible on a light dialog
                and a near-black one on a dark dialog. */}
            <span
              aria-hidden
              style={{
                width: '100%',
                height: 56,
                boxSizing: 'border-box',
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                background: bg,
                border: '1px solid var(--border)',
                borderRadius: RADIUS.control,
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: 8,
                  width: '60%',
                  borderRadius: RADIUS.pill,
                  background: text,
                }}
              />
              <span
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: 4,
                  background: surface,
                  borderRadius: RADIUS.control,
                }}
              >
                <span
                  style={{
                    display: 'block',
                    height: 6,
                    width: '40%',
                    borderRadius: RADIUS.pill,
                    background: accent,
                  }}
                />
              </span>
            </span>
            <span style={{ fontSize: 12, fontWeight: on ? 700 : 400 }}>
              {on ? '●' : '○'} {THEME_LABELS[t]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const PHASES = [
  ['phase_morning_start', 'Morning', 'var(--phase-morning)'],
  ['phase_work_start', 'Work', 'var(--phase-work)'],
  ['phase_evening_start', 'Evening', 'var(--phase-evening)'],
  ['phase_sleep_start', 'Sleep', 'var(--phase-sleep)'],
] as const;

// The day as one 24-hour bar, so moving a start time shows what it
// takes from the part of the day before it.
function DayBar({ starts }: { starts: number[] }) {
  const [m, w, e, s] = starts;
  const parts: [number, string][] = [
    [m, 'var(--phase-sleep)'],
    [w - m, 'var(--phase-morning)'],
    [e - w, 'var(--phase-work)'],
    [s - e, 'var(--phase-evening)'],
    [24 - s, 'var(--phase-sleep)'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        aria-hidden
        style={{
          display: 'flex',
          height: 24,
          borderRadius: RADIUS.control,
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}
      >
        {parts.map(([len, c], i) => (
          <span key={i} style={{ flex: Math.max(0, len), background: c }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', ...sub }}>
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>12 AM</span>
      </div>
    </div>
  );
}

export default function SettingsDialog({
  onClose,
  onOpenShortcuts,
  onExport,
  theme,
  onSelectTheme,
  onLangChange,
}: {
  onClose: () => void;
  onOpenShortcuts: () => void;
  onExport: () => void;
  theme: Theme;
  onSelectTheme: (t: Theme) => void;
  // The language control already persisted through `patch`; this tells
  // App so the running UI switches immediately rather than on next load.
  onLangChange: (l: 'en' | 'bn') => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<React.ReactNode | null>(null);
  const [tab, setTab] = useState<Tab>('look');
  const dialogRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    settingsApi.get().then(setSettings);
  }, []);

  // Optimistic locally, persisted immediately — this dialog has no
  // separate "Save" step; every control commits on change, same as the
  // rest of this app's settings (theme, onboarded) already do.
  const patch = (p: SettingsPatch) => {
    if (!settings) return;
    setSettings({ ...settings, ...p });
    setSaving(true);
    settingsApi
      .update(p)
      .then(setSettings)
      .finally(() => setSaving(false));
  };

  if (!settings) return null;

  const starts = PHASES.map(([k]) => settings[k]);
  const inOrder = starts.every((h, i) => i === 0 || h > starts[i - 1]);
  const IDLE = [5, 10, 15, 30, 60];

  return (
    // Mouse-only close-on-backdrop-click convenience — Escape (this
    // dialog's real keyboard equivalent) is handled centrally by
    // App.tsx's dialogStack, and useFocusTrap already keeps Tab inside
    // the dialog, so this backdrop itself needs no keyboard path of its
    // own.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
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
      onClick={onClose}
    >
      {/* Containment only, not an interaction of its own — stops a click
          inside the dialog from bubbling to the backdrop above and
          closing it. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: RADIUS.card,
          width: 712,
          maxWidth: 'calc(100vw - 32px)',
          height: 592,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 16px 12px 24px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h2 id="settings-title" style={{ margin: 0, fontSize: 16 }}>
            Settings
          </h2>
          <span
            style={{
              fontSize: 12,
              color: saving ? 'var(--text-faint)' : 'var(--success)',
            }}
          >
            {saving ? 'Saving…' : '✓ Saved automatically'}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            style={{
              ...plainBtn,
              width: 28,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div
            role="tablist"
            aria-orientation="vertical"
            style={{
              width: 176,
              flexShrink: 0,
              padding: '12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              background: 'var(--bg)',
              borderRight: '1px solid var(--border)',
            }}
          >
            {TABS.map(([id, icon, label]) => {
              const on = tab === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(id)}
                  style={{
                    height: 36,
                    padding: '0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: 'none',
                    borderRadius: RADIUS.control,
                    background: on ? 'var(--surface)' : 'transparent',
                    color: on ? 'var(--accent)' : 'var(--text)',
                    fontSize: 13,
                    fontWeight: on ? 700 : 400,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span aria-hidden style={{ width: 16, textAlign: 'center' }}>
                    {icon}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '16px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              overflowY: 'auto',
            }}
          >
            {tab === 'look' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={heading}>THEME</span>
                  <ThemePicker value={theme} onSelect={onSelectTheme} />
                </div>
                <Row label="Language" hint="Menus and labels across the app">
                  <div
                    role="radiogroup"
                    aria-label="Language"
                    style={{
                      display: 'flex',
                      border: '1px solid var(--border)',
                      borderRadius: RADIUS.control,
                      overflow: 'hidden',
                    }}
                  >
                    {(['en', 'bn'] as const).map((v, i) => {
                      const on = settings.lang === v;
                      return (
                        <button
                          key={v}
                          role="radio"
                          aria-checked={on}
                          onClick={() => {
                            if (on) return;
                            patch({ lang: v });
                            onLangChange(v);
                          }}
                          style={{
                            height: 28,
                            padding: '0 12px',
                            border: 'none',
                            borderLeft: i ? '1px solid var(--border)' : 'none',
                            borderRadius: 0,
                            background: on ? 'var(--accent)' : 'var(--surface)',
                            color: on ? 'var(--on-accent)' : 'var(--text)',
                            fontSize: 12,
                            fontWeight: on ? 700 : 400,
                            cursor: on ? 'default' : 'pointer',
                          }}
                        >
                          {v === 'en' ? 'English' : 'বাংলা'}
                        </button>
                      );
                    })}
                  </div>
                </Row>
                <Row label="Analog clock face" hint="Show clock hands instead of digits on the clock card">
                  <Toggle
                    label="Analog clock face"
                    on={settings.analog_clock}
                    onClick={() => patch({ analog_clock: !settings.analog_clock })}
                  />
                </Row>
                <Row label="PLAN follows the time of day" hint="Morning, work and evening each open their own PLAN view">
                  <Toggle
                    label="PLAN follows the time of day"
                    on={settings.plan_adaptive}
                    onClick={() => patch({ plan_adaptive: !settings.plan_adaptive })}
                  />
                </Row>
              </>
            )}

            {tab === 'time' && (
              <>
                <Row label="Start the timer when I open a project" hint="Opening a project starts tracking its time right away">
                  <Toggle
                    label="Start the timer when I open a project"
                    on={settings.auto_timer_on_open}
                    onClick={() =>
                      patch({
                        auto_timer_on_open: !settings.auto_timer_on_open,
                      })
                    }
                  />
                </Row>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Row label="Stop the timer after idle" hint="No mouse or keyboard for this long stops the running timer">
                    <span />
                  </Row>
                  <div role="radiogroup" aria-label="Stop after idle" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(IDLE.includes(settings.idle_stop_min) ? IDLE : [...IDLE, settings.idle_stop_min].sort((a, b) => a - b)).map((m) => {
                      const on = settings.idle_stop_min === m;
                      return (
                        <button
                          key={m}
                          role="radio"
                          aria-checked={on}
                          onClick={() => patch({ idle_stop_min: m })}
                          style={{
                            ...plainBtn,
                            height: 32,
                            minWidth: 56,
                            borderColor: on ? 'var(--accent)' : 'var(--border)',
                            background: on ? 'var(--accent-light)' : 'var(--surface)',
                            color: on ? 'var(--accent)' : 'var(--text)',
                            fontWeight: on ? 700 : 400,
                          }}
                        >
                          {m} min
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ height: 1, background: 'var(--border)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Row label="Daily goal" hint="Used only while your projects have no daily targets of their own">
                    <Stepper
                      label="Daily goal"
                      value={settings.goal_hours}
                      min={1}
                      max={12}
                      onChange={(v) => patch({ goal_hours: v })}
                      format={(v) => `${v} h`}
                    />
                  </Row>
                  <div
                    aria-hidden
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                      gap: 2,
                    }}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <span
                        key={i}
                        style={{
                          height: 8,
                          borderRadius: RADIUS.control,
                          background: i < settings.goal_hours ? 'var(--accent)' : 'var(--surface-2)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === 'day' && (
              <>
                <Row label="Your day" hint="PLAN and the clock switch views when each part of the day starts">
                  <span />
                </Row>
                <DayBar starts={starts} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {PHASES.map(([key, name, color], i) => {
                    const next = i < 3 ? starts[i + 1] : starts[0] + 24;
                    const len = next - starts[i];
                    return (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 12,
                            height: 12,
                            flexShrink: 0,
                            borderRadius: RADIUS.pill,
                            background: color,
                          }}
                        />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{name} starts</span>
                        <span style={{ ...sub, width: 40, textAlign: 'right' }}>{len > 0 ? `${len} h` : '—'}</span>
                        <Stepper
                          label={`${name} starts`}
                          value={starts[i]}
                          min={0}
                          max={23}
                          onChange={(v) => patch({ [key]: v })}
                          format={formatPhase}
                        />
                      </div>
                    );
                  })}
                </div>
                {!inOrder && (
                  <span role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>
                    Each part of the day should start after the one before it.
                  </span>
                )}
              </>
            )}

            {tab === 'system' && (
              <>
                <Row
                  dim
                  label={
                    <>
                      Start with Windows{' '}
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '2px 8px',
                          marginLeft: 4,
                          borderRadius: RADIUS.pill,
                          background: 'var(--surface-2)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        Coming soon
                      </span>
                    </>
                  }
                  hint="Saved as a preference only — not connected to Windows startup yet"
                >
                  <Toggle
                    label="Start with Windows"
                    on={settings.start_with_windows}
                    onClick={() =>
                      patch({
                        start_with_windows: !settings.start_with_windows,
                      })
                    }
                  />
                </Row>
                <div style={{ height: 1, background: 'var(--border)' }} />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                  }}
                >
                  {[
                    ['⬇ Export data', 'Save a copy of everything', onExport],
                    ['⌨ Keyboard shortcuts', 'See every shortcut', onOpenShortcuts],
                  ].map(([title, hint, go]) => (
                    <button
                      key={title as string}
                      onClick={() => {
                        onClose();
                        (go as () => void)();
                      }}
                      style={{
                        ...plainBtn,
                        height: 56,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        justifyContent: 'center',
                        gap: 2,
                        borderRadius: RADIUS.card,
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{title as string}</span>
                      <span style={sub}>{hint as string}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {tab === 'about' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: RADIUS.card,
                      background: 'var(--accent)',
                      color: 'var(--on-accent)',
                      fontSize: 16,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    H
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>Habit OS</span>
                    <span style={sub}>Version {APP_VERSION}</span>
                  </div>
                </div>
                {/* Placeholder, same as the legacy dialog's own — always reports
                    latest, no real update service wired up on either side. */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    onClick={() =>
                      setUpdateStatus(
                        <>
                          <Check size={12} /> You're on the latest version ({APP_VERSION})
                        </>,
                      )
                    }
                    style={{ ...plainBtn, height: 32 }}
                  >
                    Check for updates
                  </button>
                  {updateStatus && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        color: 'var(--success)',
                      }}
                    >
                      {updateStatus}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Contact: {APP_CONTACT}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

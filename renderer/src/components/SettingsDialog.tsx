import { useEffect, useState } from 'react';
import { Settings, SettingsPatch, settingsApi } from '../services/api';

const APP_VERSION = '0.1.0';
const APP_CONTACT = 'balakaint@gmail.com';

function formatPhase(hour: number): string {
  const h12 = hour % 12 || 12;
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 'bold',
          letterSpacing: 0.5,
          opacity: 0.6,
          borderBottom: '1px solid var(--border, #ccc)',
          paddingBottom: 4,
          marginBottom: 8,
        }}
      >
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 0' }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: '1px solid var(--border, #ccc)',
        background: on ? 'var(--accent, #4f8cff)' : 'transparent',
        position: 'relative',
        cursor: 'pointer',
        padding: 0,
      }}
      aria-pressed={on}
    >
      <span
        style={{
          position: 'absolute',
          top: 1,
          left: on ? 19 : 1,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: on ? '#fff' : 'var(--text-muted, #888)',
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
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button onClick={() => onChange(Math.max(min, value - 1))} style={{ width: 24 }}>
        −
      </button>
      <span style={{ fontSize: 13, minWidth: 56, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
        {format ? format(value) : value}
      </span>
      <button onClick={() => onChange(Math.min(max, value + 1))} style={{ width: 24 }}>
        +
      </button>
    </div>
  );
}

export default function SettingsDialog({
  onClose,
  onOpenShortcuts,
  onExport,
}: {
  onClose: () => void;
  onOpenShortcuts: () => void;
  onExport: () => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

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
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface, #fff)',
          color: 'var(--text, #111)',
          border: '1px solid var(--border, #ccc)',
          borderRadius: 10,
          padding: 24,
          width: 380,
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Settings</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
          {saving ? 'Saving…' : 'Every change is saved automatically'}
        </div>

        <Section title="Appearance">
          <Row label="Language">
            <div style={{ display: 'flex', gap: 4 }}>
              {(['en', 'bn'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => patch({ lang: v })}
                  disabled={settings.lang === v}
                  style={{ fontSize: 12, padding: '3px 8px' }}
                >
                  {v === 'en' ? 'English' : 'বাংলা'}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Analog clock face">
            <Toggle on={settings.analog_clock} onClick={() => patch({ analog_clock: !settings.analog_clock })} />
          </Row>
        </Section>

        <Section title="Time tracking">
          <Row label="Start timer when I open a project">
            <Toggle
              on={settings.auto_timer_on_open}
              onClick={() => patch({ auto_timer_on_open: !settings.auto_timer_on_open })}
            />
          </Row>
          <Row label="Stop after idle">
            <Stepper
              value={settings.idle_stop_min}
              min={2}
              max={120}
              onChange={(v) => patch({ idle_stop_min: v })}
              format={(v) => `${v} min`}
            />
          </Row>
        </Section>

        <Section title="Schedule">
          <Row label="Morning starts">
            <Stepper
              value={settings.phase_morning_start}
              min={0}
              max={23}
              onChange={(v) => patch({ phase_morning_start: v })}
              format={formatPhase}
            />
          </Row>
          <Row label="Work starts">
            <Stepper
              value={settings.phase_work_start}
              min={0}
              max={23}
              onChange={(v) => patch({ phase_work_start: v })}
              format={formatPhase}
            />
          </Row>
          <Row label="Evening starts">
            <Stepper
              value={settings.phase_evening_start}
              min={0}
              max={23}
              onChange={(v) => patch({ phase_evening_start: v })}
              format={formatPhase}
            />
          </Row>
          <Row label="Sleep starts">
            <Stepper
              value={settings.phase_sleep_start}
              min={0}
              max={23}
              onChange={(v) => patch({ phase_sleep_start: v })}
              format={formatPhase}
            />
          </Row>
        </Section>

        <Section title="Productivity">
          <Row label="Daily goal">
            <Stepper
              value={settings.goal_hours}
              min={1}
              max={12}
              onChange={(v) => patch({ goal_hours: v })}
              format={(v) => `${v} h`}
            />
          </Row>
        </Section>

        <Section title="System">
          <Row label="Currency symbol">
            <input
              value={settings.currency}
              onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
              onBlur={(e) => patch({ currency: e.target.value })}
              maxLength={4}
              style={{ width: 48, fontSize: 13, padding: 4, textAlign: 'center' }}
            />
          </Row>
          <Row label="Start with Windows">
            <Toggle
              on={settings.start_with_windows}
              onClick={() => patch({ start_with_windows: !settings.start_with_windows })}
            />
          </Row>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
            Saved as a preference only — not yet wired to actually register the app with Windows startup.
          </div>
        </Section>

        <Section title="More">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={() => { onClose(); onOpenShortcuts(); }} style={{ textAlign: 'left', fontSize: 13 }}>
              ⌨ Keyboard Shortcuts
            </button>
            <button onClick={() => { onClose(); onExport(); }} style={{ textAlign: 'left', fontSize: 13 }}>
              ⬇ Export Data
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 10 }}>
            Task Tracker · Version {APP_VERSION}
            <br />
            Contact: {APP_CONTACT}
          </div>
          {/* Placeholder, same as the legacy dialog's own — always reports
              latest, no real update service wired up on either side. */}
          <button
            onClick={() => setUpdateStatus(`✓ You're on the latest version (${APP_VERSION})`)}
            style={{ fontSize: 12, marginTop: 8 }}
          >
            Check for Updates
          </button>
          {updateStatus && <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{updateStatus}</div>}
        </Section>
      </div>
    </div>
  );
}

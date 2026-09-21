import { useEffect, useState } from 'react';
import { Settings, settingsApi } from '../services/api';
import DayPhaseBars, { currentPhaseInfo } from './DayPhaseBars';
import ScopeStats from './ScopeStats';
import { RADIUS } from '../spacing';
import RitualRing from './RitualRing';

// Second pass (2026-09-18, Zahid: "2 can use more space suggest me for
// clock day" — the digital HH:MM:SS + weekday + date block was a third
// reading of "what time is it" on one small card, next to the phase
// bars' own position and (in ScopeStats, below) a TODAY countdown).
// Replaced with one ring, colored by whichever phase is active, showing
// that phase's own remaining time — the number you can actually still
// act on, read once instead of three times. The analog dial option is
// untouched: still opt-in via Settings, still layered above whatever
// the right column is showing.
function fmtRemaining(hours: number): string {
  const totalMin = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, '0')}m`;
}

// Matches legacy's _draw_clock_face for the optional analog dial: an
// SVG circle/line dial standing in for legacy's raw Canvas draw calls,
// defaulting OFF (legacy's own comment: a 60-tick face with jagged
// un-antialiased edges answers "what time is it?" worse than a digital
// readout does) — drawn only when the analog_clock setting is on.
export default function ClockCard() {
  const [now, setNow] = useState(new Date());
  const [analog, setAnalog] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    settingsApi.get().then((s) => {
      setAnalog(s.analog_clock);
      setSettings(s);
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();

  const hourAngle = (h % 12) * 30 + m * 0.5;
  const minAngle = m * 6 + s * 0.1;
  const secAngle = s * 6;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const hand = (angleDeg: number, length: number) => ({
    x2: 60 + length * Math.sin(rad(angleDeg)),
    y2: 60 - length * Math.cos(rad(angleDeg)),
  });
  const hourHand = hand(hourAngle, 28);
  const minHand = hand(minAngle, 40);
  const secHand = hand(secAngle, 45);

  return (
    // Legacy's arrangement: the day-phase bars on the LEFT and the clock
    // beside them on the right, with the scope stats underneath both.
    // The port had the clock first and the phases below it, which reads
    // as "here is the time, and also some bars" — where legacy reads as
    // "here is where you are in the day", with the clock as the label
    // rather than the headline. On a fixed-width panel the two sit side
    // by side comfortably and save a good deal of vertical space.
    <div
      className="card-elevated"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: RADIUS.card,
        padding: 12,
        marginBottom: 12,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DayPhaseBars />
        </div>
        <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
          {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.2 }}>
          {now.toLocaleDateString(undefined, { weekday: 'short' })}
          {' · '}
          {now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </div>
      </div>
      {analog && (
        <svg width="110" height="110" viewBox="0 0 120 120" style={{ marginBottom: 8 }}>
          <circle cx="60" cy="60" r="56" fill="var(--bg)" stroke="var(--border)" strokeWidth={1.5} />
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = rad(i * 30);
            return (
              <line
                key={i}
                x1={60 + 46 * Math.sin(angle)}
                y1={60 - 46 * Math.cos(angle)}
                x2={60 + 52 * Math.sin(angle)}
                y2={60 - 52 * Math.cos(angle)}
                stroke="var(--text-muted)"
                strokeWidth={2}
              />
            );
          })}
          <line x1="60" y1="60" x2={hourHand.x2} y2={hourHand.y2} stroke="var(--text)" strokeWidth={4} strokeLinecap="round" />
          <line x1="60" y1="60" x2={minHand.x2} y2={minHand.y2} stroke="var(--text)" strokeWidth={3} strokeLinecap="round" />
          <line x1="60" y1="60" x2={secHand.x2} y2={secHand.y2} stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" />
          <circle cx="60" cy="60" r="3" fill="var(--accent)" />
        </svg>
      )}
      {settings &&
        (() => {
          const phase = currentPhaseInfo(settings, now);
          if (!phase) return null;
          return (
            <div style={{ width: 96, margin: '0 auto' }}>
              <RitualRing progress={phase.progress} size={76} stroke={5} accent={phase.color}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: phase.color }}>
                    {phase.label.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                    {fmtRemaining(phase.remainingHours)}
                  </span>
                </div>
              </RitualRing>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>left in phase</div>
            </div>
          );
        })()}
        </div>
      </div>
      <ScopeStats />
    </div>
  );
}

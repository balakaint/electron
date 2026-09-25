import { useEffect, useRef, useState } from 'react';
import { Settings, settingsApi } from '../services/api';
import DayPhaseStrip, { currentPhaseInfo } from './DayPhaseBars';
import ScopeStats from './ScopeStats';
import RitualRing from './RitualRing';
import { PHASE_LABELS_BN, useL, useLang } from '../i18n';
import { RADIUS, SPACE } from '../spacing';

// PLAN's TODAY card: what time it is, which part of the day you are in
// and how much of it is left, the day as one proportional strip, and
// the three horizons (month, year, 90-day plan) under it.
//
// Hierarchy, top to bottom, is the order the questions get asked in:
// "what time is it" (the one large number), "where am I in the day"
// (the phase pill and its countdown, then the strip), "and in the
// bigger picture" (the tiles). The previous card answered the second
// question four times — four equal bars with four percentages — and
// gave the first one a 12px date line, so nothing on it led.
//
// The analog dial stays for whoever has it switched on (Settings,
// analog_clock): it replaces the large digital time rather than sitting
// next to it, the same one-clock-per-state rule the card already had.

// Matches legacy's _draw_clock_face for the optional analog dial: an
// SVG circle/line dial standing in for legacy's raw Canvas draw calls,
// defaulting OFF (legacy's own comment: a 60-tick face with jagged
// un-antialiased edges answers "what time is it?" worse than a digital
// readout does) — drawn only when the analog_clock setting is on.
function AnalogDial({ now, progress, color }: { now: Date; progress: number; color: string }) {
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const hand = (angleDeg: number, length: number) => ({
    x2: 50 + length * Math.sin(rad(angleDeg)),
    y2: 50 - length * Math.cos(rad(angleDeg)),
  });
  const hourHand = hand((h % 12) * 30 + m * 0.5, 22);
  const minHand = hand(m * 6 + s * 0.1, 30);
  const secHand = hand(s * 6, 35);

  return (
    <RitualRing
      progress={progress}
      accent={color}
      trackColor="color-mix(in srgb, var(--progress-track) 20%, transparent)"
      size={97}
      stroke={6}
    >
      <svg width="91" height="91" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" fill="var(--bg)" stroke="var(--border)" strokeWidth={1.5} />
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = rad(i * 30);
          return (
            <line
              key={i}
              x1={50 + 36 * Math.sin(angle)}
              y1={50 - 36 * Math.cos(angle)}
              x2={50 + 41 * Math.sin(angle)}
              y2={50 - 41 * Math.cos(angle)}
              stroke="var(--text-muted)"
              strokeWidth={2}
            />
          );
        })}
        <line x1="50" y1="50" x2={hourHand.x2} y2={hourHand.y2} stroke="var(--text)" strokeWidth={4} strokeLinecap="round" />
        <line x1="50" y1="50" x2={minHand.x2} y2={minHand.y2} stroke="var(--text)" strokeWidth={3} strokeLinecap="round" />
        <line x1="50" y1="50" x2={secHand.x2} y2={secHand.y2} stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" />
        <circle cx="50" cy="50" r="3" fill="var(--accent)" />
      </svg>
    </RitualRing>
  );
}

export default function ClockCard({
  onOpenQuarterly,
  compact = false,
  slim = false,
}: {
  onOpenQuarterly: () => void;
  compact?: boolean;
  // EXECUTE's one-row version: time, date, phase and what is left of it,
  // over the day strip without its labels. No horizon tiles — those are
  // PLAN's — but the clock itself, because the work happens on EXECUTE.
  slim?: boolean;
}) {
  const lang = useLang();
  const L = useL();
  const [now, setNow] = useState(new Date());
  const [analog, setAnalog] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  // currentPhaseInfo returns null for a sub-second instant right at a
  // phase boundary (progress exactly 0 or 1) — without this, the "Xh
  // Ym left" line would blink out and back every boundary crossing
  // (UX audit, 2026-09-24 Polish finding). Remembering the last real
  // reading means the boundary instant renders "0m left" instead of
  // nothing, so the line never disappears.
  const lastPhaseRef = useRef<ReturnType<typeof currentPhaseInfo>>(null);

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

  const live = settings ? currentPhaseInfo(settings, now) : null;
  if (live) lastPhaseRef.current = live;
  const phase = live ?? lastPhaseRef.current;

  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const month = now.toLocaleDateString(undefined, { month: 'short' });
  const dateLine = `${weekday}, ${now.getDate()} ${month} ${now.getFullYear()}`;
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const totalMin = phase ? Math.max(0, Math.round(phase.remainingHours * 60)) : 0;

  const phaseBlock = phase && (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: analog ? 'flex-start' : 'flex-end', gap: SPACE.xs }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.5,
          // --surface on the phase colour, not white: the dark themes'
          // phase colours are light tints, and white text on them fails.
          color: 'var(--surface)',
          background: phase.color,
          padding: `${SPACE.hair}px ${SPACE.sm}px`,
          borderRadius: RADIUS.pill,
        }}
      >
        {(lang === 'bn' ? PHASE_LABELS_BN[phase.key] : phase.label).toUpperCase()}
      </span>
      <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>
          {Math.floor(totalMin / 60)}h {String(totalMin % 60).padStart(2, '0')}m
        </span>
        <span style={{ color: 'var(--text-faint)' }}> {L('left', 'বাকি')}</span>
      </span>
    </div>
  );

  if (slim) {
    return (
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: RADIUS.card,
          padding: `${SPACE.sm}px ${SPACE.md}px`,
          marginBottom: SPACE.md,
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE.sm,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, minWidth: 0 }}>
          <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {time}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {dateLine}
          </span>
          {phase && (
            <>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: 'var(--surface)',
                  background: phase.color,
                  padding: `${SPACE.hair}px ${SPACE.sm}px`,
                  borderRadius: RADIUS.pill,
                  whiteSpace: 'nowrap',
                }}
              >
                {(lang === 'bn' ? PHASE_LABELS_BN[phase.key] : phase.label).toUpperCase()}
              </span>
              <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                  {Math.floor(totalMin / 60)}h {String(totalMin % 60).padStart(2, '0')}m
                </span>
                <span style={{ color: 'var(--text-faint)' }}> {L('left', 'বাকি')}</span>
              </span>
            </>
          )}
        </div>
        {settings && <DayPhaseStrip settings={settings} now={now} compact />}
      </div>
    );
  }

  return (
    <div
      className="card-elevated"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: RADIUS.card,
        padding: compact ? SPACE.md : SPACE.lg,
        marginBottom: SPACE.md,
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? SPACE.sm : SPACE.md,
      }}
    >
      <div style={{ display: 'flex', alignItems: analog ? 'center' : 'flex-end', gap: SPACE.md }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{dateLine}</span>
          {analog ? (
            phaseBlock
          ) : (
            <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {time}
            </span>
          )}
        </div>
        <span style={{ flex: 1 }} />
        {analog ? (
          <AnalogDial now={now} progress={phase?.progress ?? 0} color={phase?.color ?? 'var(--border)'} />
        ) : (
          phaseBlock
        )}
      </div>

      {/* The phase names and start times under the bar stay in the
          compact card too — they say when each part of the day begins. */}
      {settings && <DayPhaseStrip settings={settings} now={now} />}

      <ScopeStats now={now} onOpenQuarterly={onOpenQuarterly} compact={compact} />
    </div>
  );
}

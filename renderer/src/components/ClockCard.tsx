import { useEffect, useRef, useState } from 'react';
import { Settings, settingsApi } from '../services/api';
import DayPhaseBars, { currentPhaseInfo } from './DayPhaseBars';
import ScopeStats from './ScopeStats';
import RitualRing from './RitualRing';
import { RADIUS } from '../spacing';

// Second pass (2026-09-18, Zahid: "2 can use more space suggest me for
// clock day" — the digital HH:MM:SS + weekday + date block was a third
// reading of "what time is it" on one small card, next to the phase
// bars' own position and (in ScopeStats, below) a TODAY countdown).
// Replaced with a ring, then (2026-09-24, second pass) the ring itself
// replaced with the same plain bold-number/faint-"left" text used when
// the analog dial is on — one clock-like shape per state, not two, and
// the same treatment whichever setting is active. See the render body
// below for the current "Nh NNm left" text.

// Matches legacy's _draw_clock_face for the optional analog dial: an
// SVG circle/line dial standing in for legacy's raw Canvas draw calls,
// defaulting OFF (legacy's own comment: a 60-tick face with jagged
// un-antialiased edges answers "what time is it?" worse than a digital
// readout does) — drawn only when the analog_clock setting is on.
export default function ClockCard() {
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

  // Computed here (not inside the render-time IIFE it used to live in)
  // so both the ring AND the dial can read the same `phase` — merging
  // them into one shape needs the progress/color before the SVG draws,
  // not after (Zahid's reference, 2026-09-24: fit the old standalone
  // ring INTO the clock circle instead of stacking two circles).
  const live = settings ? currentPhaseInfo(settings, now) : null;
  if (live) lastPhaseRef.current = live;
  const phase = live ?? lastPhaseRef.current;

  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();

  const hourAngle = (h % 12) * 30 + m * 0.5;
  const minAngle = m * 6 + s * 0.1;
  const secAngle = s * 6;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  // Center (50,50) in a 100x100 inner face — sized to sit inside
  // RitualRing's own ring (size 120, stroke 8 -> inner clear radius
  // ~52) with a small visible gap, same as before the refactor.
  const hand = (angleDeg: number, length: number) => ({
    x2: 50 + length * Math.sin(rad(angleDeg)),
    y2: 50 - length * Math.cos(rad(angleDeg)),
  });
  const hourHand = hand(hourAngle, 22);
  const minHand = hand(minAngle, 30);
  const secHand = hand(secAngle, 35);

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
      <div style={{ marginBottom: 8 }}>
        {/* The analog dial IS "what time is it" once it's on — a digital
            HH:MM stacked right above it answered the same question
            twice (Zahid, 2026-09-24 hierarchy pass). Date/weekday stays:
            the dial carries no date. */}
        {!analog && (
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
            {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', lineHeight: 1.2 }}>
          {now.toLocaleDateString(undefined, { weekday: 'short' })}
          {' · '}
          {now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </div>
      </div>
      {analog && (
        // The old standalone WORK ring, fit INTO the clock circle as its
        // own outer rim instead of stacked as a second circle below it
        // (Zahid's reference mockup, 2026-09-24) — one combined shape:
        // phase progress on the rim, the dial (ticks + hands) inside it.
        // Reuses RitualRing (the app's one shared radial-progress
        // component, already used by MorningRitualFlow/
        // DisciplineModuleCards/MorningRitualTrend) instead of a second
        // hand-rolled stroke-dasharray implementation — same ring math,
        // same 200ms sweep transition, one component (UX audit,
        // 2026-09-24).
        <div style={{ marginBottom: 4 }}>
          {/* Inner clock another 5% bigger, outer ring unchanged
              (Zahid, 2026-09-24): 85->89, ring stays 97/6 — clock now
              slightly exceeds the ring's own clear opening (~85 at
              this size/stroke), so it sits very slightly under the
              ring's inner edge rather than with a visible gap; flagged
              to Zahid before applying, confirmed. Track (the
              remaining/unfilled arc) at 20% opacity (50% -> 30% more
              transparent) so the filled progress reads as the one
              solid shape on the rim. */}
          <RitualRing
            progress={phase?.progress ?? 0}
            accent={phase?.color ?? 'var(--border)'}
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
        </div>
      )}
      {phase &&
        (() => {
          // The number is the fact worth reading, "left" is the same
          // faint framing word every other countdown on this card uses.
          const totalMin = Math.max(0, Math.round(phase.remainingHours * 60));
          return (
            <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              {/* "3h 06m" — lowercase units, all bold, a real space
                  between the two number+unit pairs so they read as two
                  grouped values, not one run-on string. */}
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{Math.floor(totalMin / 60)}h</span>
              {' '}
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{String(totalMin % 60).padStart(2, '0')}m</span>
              <span style={{ color: 'var(--text-faint)' }}> left</span>
            </div>
          );
        })()}
        </div>
      </div>
      <ScopeStats />
    </div>
  );
}

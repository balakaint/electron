import { useEffect, useState } from 'react';
import { settingsApi } from '../services/api';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Matches legacy's _draw_clock_face: one card, digital time + two date
// lines always shown, an optional analog dial layered above it. The
// dial defaults OFF in legacy too (its own comment: a 60-tick face
// with jagged un-antialiased edges answers "what time is it?" when the
// digital readout right below it already does that better) — so this
// only draws the <svg> when the analog_clock setting is on, an SVG
// circle/line dial standing in for legacy's raw Canvas draw calls.
export default function ClockCard() {
  const [now, setNow] = useState(new Date());
  const [analog, setAnalog] = useState(false);

  useEffect(() => {
    settingsApi.get().then((s) => setAnalog(s.analog_clock));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const h12 = h % 12 === 0 ? 12 : h % 12;

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
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        textAlign: 'center',
        maxWidth: 220,
      }}
    >
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
      <div style={{ fontSize: 30, fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--text)' }}>
        {pad(h12)}:{pad(m)}:{pad(s)}
        <span style={{ fontSize: 13, opacity: 0.6, marginLeft: 4 }}>{h < 12 ? 'AM' : 'PM'}</span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
        {now.toLocaleDateString(undefined, { weekday: 'long' })}
      </div>
      <div style={{ fontSize: 11, opacity: 0.5 }}>
        {now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
}

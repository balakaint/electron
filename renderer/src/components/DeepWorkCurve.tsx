import { useEffect, useRef, useState } from 'react';
import { DeepWorkCurve as Curve, Settings, projectsApi } from '../services/api';
import { useL } from '../i18n';
import { RADIUS, SPACE } from '../spacing';

// PLAN's deep work curve: minutes worked today, added up through the
// day, so the shape says how the day is going — rising while you work,
// flat through the gaps. The dashed line is an even pace from the start
// of work to the day's goal by the start of the evening; above it you
// are ahead. One series, so no legend: the heading names it.
//
// The x-axis runs from the morning start to the sleep start (Settings'
// schedule). Hovering shows the time and the total up to it.

const H = 76; // plot height
const BASE = 70; // y of zero
const TOP = 10; // y of the goal

function fmt(secs: number): string {
  const m = Math.round(secs / 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function clockLabel(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  const d = new Date(2000, 0, 1, hh, mm);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function DeepWorkCurve({ settings }: { settings: Settings }) {
  const L = useL();
  const [data, setData] = useState<Curve | null>(null);
  const [width, setWidth] = useState(240);
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const run = () =>
      projectsApi
        .deepWorkCurve()
        .then((d) => alive && setData(d))
        .catch(() => {});
    run();
    // The timer credits once a minute, so re-reading more often adds nothing.
    const id = setInterval(run, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(120, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const t0 = settings.phase_morning_start;
  let t1 = settings.phase_sleep_start;
  if (t1 <= t0) t1 += 24;
  const ws = settings.phase_work_start;
  let es = settings.phase_evening_start;
  if (es <= ws) es += 24;

  const goal = data?.goal_secs || 1;
  const x = (h: number) => ((h - t0) / (t1 - t0)) * width;
  const y = (secs: number) => BASE - (Math.min(secs, goal * 1.1) / goal) * (BASE - TOP);

  // Hours-of-the-day for each span, relative to local midnight.
  const toH = (ts: number) => (ts - (data?.day_start ?? 0)) / 3600;
  const spans = data ? [...data.spans, ...(data.running ? [data.running] : [])].map((s) => [toH(s.start), toH(s.end)] as const) : [];
  const logged = spans.reduce((n, [a, b]) => n + (b - a) * 3600, 0);
  // Time worked today before spans were recorded (the day this shipped).
  const untimed = data ? Math.max(0, data.total_secs - (logged - (data.running ? (data.running.end - data.running.start) : 0))) : 0;
  const workedAt = (h: number) => untimed + spans.reduce((n, [a, b]) => n + Math.max(0, Math.min(h, b) - a) * 3600, 0);
  const paceAt = (h: number) => (h <= ws ? 0 : h >= es ? goal : ((h - ws) / (es - ws)) * goal);

  const nowH = data ? toH(data.now) : t0;
  const endH = Math.min(Math.max(nowH, t0), t1);
  const total = workedAt(endH);

  // The curve, sampled at every span edge (so corners are exact) plus
  // the ends of the axis.
  const hs = Array.from(new Set([t0, ...spans.flat().filter((h) => h > t0 && h < endH), endH])).sort((a, b) => a - b);
  const line = hs.map((h, i) => `${i ? 'L' : 'M'}${x(h).toFixed(1)} ${y(workedAt(h)).toFixed(1)}`).join(' ');
  const area = `${line} L${x(endH).toFixed(1)} ${BASE} L${x(t0).toFixed(1)} ${BASE} Z`;
  const pace = `M${x(t0)} ${BASE} L${x(Math.max(t0, ws))} ${BASE} L${x(Math.min(t1, es))} ${y(goal)} L${width} ${y(goal)}`;
  const diff = total - paceAt(endH);
  const showPace = endH > ws;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const h = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
    setHover(h >= t0 && h <= endH ? h : null);
  };

  const ticks = [t0, t0 + (t1 - t0) / 4, t0 + (t1 - t0) / 2, t0 + ((t1 - t0) * 3) / 4, t1];

  return (
    <div ref={boxRef} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE.xs, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {L('DEEP WORK TODAY', 'আজকের ডিপ ওয়ার্ক')}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{fmt(total)}</span>
          <span style={{ color: 'var(--text-faint)' }}> / {fmt(goal).replace(/ 00m$/, '')}</span>
        </span>
      </div>
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={L(`Deep work today: ${fmt(total)} of ${fmt(goal)}`, `আজকের ডিপ ওয়ার্ক: ${fmt(goal)}-এর ${fmt(total)}`)}
      >
        <line x1={0} y1={BASE} x2={width} y2={BASE} stroke="var(--border)" strokeWidth={1} />
        <line x1={0} y1={y(goal)} x2={width} y2={y(goal)} stroke="var(--border)" strokeWidth={1} strokeDasharray="2 3" />
        <path d={pace} fill="none" stroke="var(--text-faint)" strokeWidth={1.5} strokeDasharray="4 3" />
        <path d={area} fill="var(--accent)" fillOpacity={0.08} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {nowH >= t0 && nowH <= t1 && <line x1={x(nowH)} y1={4} x2={x(nowH)} y2={BASE} stroke="var(--text)" strokeWidth={1} />}
        <circle cx={x(endH)} cy={y(total)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        {hover !== null && (
          <>
            <line x1={x(hover)} y1={4} x2={x(hover)} y2={BASE} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="2 2" />
            <circle cx={x(hover)} cy={y(workedAt(hover))} r={4} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hover !== null && (
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: Math.min(Math.max(x(hover), 48), width - 48),
            transform: 'translateX(-50%)',
            background: 'var(--text)',
            color: 'var(--surface)',
            fontSize: 12,
            padding: `${SPACE.xs}px ${SPACE.sm}px`,
            borderRadius: RADIUS.control,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {clockLabel(hover)} · {fmt(workedAt(hover))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-faint)' }}>
        {ticks.map((h) => (
          <span key={h}>{clockLabel(h).replace(':00', '')}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: SPACE.sm, fontSize: 12, whiteSpace: 'nowrap' }}>
        {showPace ? (
          <span style={{ fontWeight: 700, color: diff >= 0 ? 'var(--success)' : 'var(--text-muted)' }}>
            {diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(diff)).replace(/^0h /, '')} {diff >= 0 ? L('ahead of pace', 'গতির চেয়ে এগিয়ে') : L('behind pace', 'গতির চেয়ে পিছিয়ে')}
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>{L('Pace starts with work', 'কাজের সময় থেকে গতি ধরা হবে')}</span>
        )}
        <span style={{ flex: 1 }} />
        <span title={L('Even pace to the goal by the end of work', 'কাজ শেষের মধ্যে লক্ষ্যে পৌঁছানোর সমান গতি')} style={{ color: 'var(--text-faint)' }}>
          ┄ {L('pace', 'গতি')}
        </span>
      </div>
    </div>
  );
}

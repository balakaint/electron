import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ImagePlus, Paperclip, Plus, Rocket, X } from 'lucide-react';
import {
  Journey,
  JourneyPin,
  JourneyStage,
  ProjectKey,
  ProjectOrderEntry,
  journeyApi,
  projectsApi,
} from '../services/api';
import { useAutoTimer } from '../useAutoTimer';
import { useL } from '../i18n';
import { useAutofocus } from '../hooks/useAutofocus';
import { PROGRESS_TRACK_SOFT, RADIUS, SPACE } from '../spacing';
import { TRACKING, TYPE_SIZE, TYPE_WEIGHT } from '../typography';

// The Journey page as a vision board (2026-09-24 redesign, from the
// "PROJECT › Journey — vision board" mockup on the design canvas).
//
// Top to bottom it answers three questions in the order they get asked:
//   1. Where am I going, and why?   the cover, the WHY, what "done"
//                                   looks like, pinned words/pictures
//   2. Where am I on the way?       the road: six stops, you-are-here
//   3. What is my next step?        the six stage columns, each with its
//                                   tasks (add/remove/tick in place) and
//                                   its exit gate
//
// Stage progress rules are unchanged and still live in engine/journey.py:
// a stage with a gate is done when its gate is ticked; without one, when
// every task is. "Move forward" on the current stage is therefore just
// the gate tick — the engine moves the pointer and sends the toast.

const STAGE_COLOR = { done: 'var(--success)', current: 'var(--accent)', upcoming: 'var(--border)' } as const;
type StageState = keyof typeof STAGE_COLOR;

function stageState(stage: JourneyStage, current: number): StageState {
  if (stage.done) return 'done';
  return stage.stage_index === current ? 'current' : 'upcoming';
}

// Whole stages count fully; the current stage adds its share of tasks
// done. So the ring moves with every tick, but can never claim a stage
// whose gate is still open.
function journeyProgress(j: Journey): number {
  if (j.launched) return 1;
  const done = j.stages.filter((s) => s.done).length;
  const cur = j.stages[j.current_stage];
  const part = cur && !cur.done && cur.tasks.length ? cur.tasks.filter((t) => t.done).length / cur.tasks.length : 0;
  return Math.min(1, (done + part) / j.stages.length);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function useImage(path: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!path) return undefined;
    let cancelled = false;
    journeyApi
      .readCoverImage(path)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

// Text on a photo: white on a dark scrim, whatever the theme — the photo
// is the user's, so no theme token can promise contrast against it.
const ON_PHOTO = '#FFFFFF';
const chipOnPhoto: React.CSSProperties = {
  fontSize: TYPE_SIZE.xs,
  fontWeight: TYPE_WEIGHT.bold,
  padding: `${SPACE.xs}px ${SPACE.md}px`,
  borderRadius: RADIUS.pill,
  background: 'rgba(255,255,255,.16)',
  border: '1px solid rgba(255,255,255,.35)',
  color: ON_PHOTO,
  whiteSpace: 'nowrap',
};
const ghostOnPhoto: React.CSSProperties = {
  fontSize: TYPE_SIZE.xs,
  padding: `${SPACE.xs}px ${SPACE.md}px`,
  border: '1px solid rgba(255,255,255,.4)',
  borderRadius: RADIUS.control,
  background: 'rgba(0,0,0,.25)',
  color: ON_PHOTO,
  display: 'inline-flex',
  alignItems: 'center',
  gap: SPACE.xs,
  cursor: 'pointer',
};

function Hero({
  journey,
  projectName,
  onMeta,
}: {
  journey: Journey;
  projectName: string;
  onMeta: (patch: Parameters<typeof journeyApi.updateMeta>[1]) => void;
}) {
  const L = useL();
  const cover = useImage(journey.cover_image);
  const pct = Math.round(journeyProgress(journey) * 100);
  const cur = journey.stages[journey.current_stage];
  const doneStages = journey.stages.filter((s) => s.done).length;
  const allTasks = journey.stages.flatMap((s) => s.tasks);
  const doneTasks = allTasks.filter((t) => t.done).length;
  const [editingDate, setEditingDate] = useState(false);
  const dateRef = useAutofocus<HTMLInputElement>(editingDate);
  const daysLeft = journey.target_date ? daysBetween(todayIso(), journey.target_date) : null;
  const targetLabel = journey.target_date
    ? new Date(`${journey.target_date}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : '';

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: RADIUS.card,
        overflow: 'hidden',
        minHeight: 232,
        background: cover
          ? `center / cover no-repeat url("${cover}")`
          : 'linear-gradient(160deg, color-mix(in srgb, var(--accent) 45%, #000) 0%, var(--accent) 55%, color-mix(in srgb, var(--accent) 45%, var(--warning)) 100%)',
        display: 'flex',
      }}
    >
      {!cover && (
        // A quiet horizon for the no-photo case, so the empty state still
        // reads as a destination rather than a blank banner.
        <svg
          viewBox="0 0 960 232"
          preserveAspectRatio="none"
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <circle cx="780" cy="150" r="44" fill="rgba(255,255,255,.35)" />
          <path d="M0 190 L140 120 L240 170 L380 90 L520 165 L640 110 L780 175 L900 120 L960 150 L960 232 L0 232 Z" fill="rgba(0,0,0,.28)" />
          <path d="M0 210 L180 160 L330 200 L470 150 L640 205 L820 160 L960 195 L960 232 L0 232 Z" fill="rgba(0,0,0,.4)" />
        </svg>
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.35) 55%, rgba(0,0,0,.05) 100%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          padding: SPACE.xl,
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE.sm,
          color: ON_PHOTO,
        }}
      >
        <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, letterSpacing: TRACKING.wide, opacity: 0.85 }}>
          {projectName.toUpperCase()} — {L('JOURNEY', 'যাত্রা')}
        </span>
        <input
          key={`${journey.project_key}-name`}
          defaultValue={journey.proj_name}
          onBlur={(e) => e.target.value !== journey.proj_name && onMeta({ proj_name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder={L('Name the destination…', 'গন্তব্যের নাম লিখুন…')}
          aria-label={L('Journey name', 'যাত্রার নাম')}
          className="journey-hero-input"
          style={{
            fontSize: TYPE_SIZE.display,
            fontWeight: TYPE_WEIGHT.bold,
            lineHeight: 1.1,
            border: 'none',
            background: 'transparent',
            color: ON_PHOTO,
            padding: 0,
            width: '100%',
          }}
        />
        <input
          key={`${journey.project_key}-tagline`}
          defaultValue={journey.tagline}
          onBlur={(e) => e.target.value !== journey.tagline && onMeta({ tagline: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder={L('Tagline…', 'ট্যাগলাইন…')}
          aria-label={L('Tagline', 'ট্যাগলাইন')}
          className="journey-hero-input"
          style={{ fontSize: TYPE_SIZE.base, border: 'none', background: 'transparent', color: ON_PHOTO, opacity: 0.9, padding: 0 }}
        />

        <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', alignItems: 'center', marginTop: SPACE.xs }}>
          <span style={chipOnPhoto}>
            {journey.launched
              ? L('Launched', 'লঞ্চ হয়েছে')
              : L(`Stage ${journey.current_stage + 1} of 6 · ${cur?.name ?? ''}`, `ধাপ ${journey.current_stage + 1}/৬ · ${cur?.name ?? ''}`)}
          </span>
          {editingDate ? (
            <input
              type="date"
              ref={dateRef}
              defaultValue={journey.target_date}
              onBlur={(e) => {
                setEditingDate(false);
                if (e.target.value !== journey.target_date) onMeta({ target_date: e.target.value });
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              style={{ ...chipOnPhoto, colorScheme: 'dark', fontFamily: 'inherit' }}
            />
          ) : (
            <button
              onClick={() => setEditingDate(true)}
              title={L('Set the target date', 'লক্ষ্যের তারিখ ঠিক করুন')}
              style={{ ...chipOnPhoto, cursor: 'pointer' }}
            >
              {daysLeft === null
                ? L('+ Target date', '+ লক্ষ্যের তারিখ')
                : daysLeft >= 0
                  ? L(`${targetLabel} · ${daysLeft} days left`, `${targetLabel} · ${daysLeft} দিন বাকি`)
                  : L(`${targetLabel} · ${-daysLeft} days past`, `${targetLabel} · ${-daysLeft} দিন পেরিয়েছে`)}
            </button>
          )}
        </div>

        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', marginTop: SPACE.md }}>
          <button
            onClick={() =>
              journeyApi.pickCoverImage().then((path) => {
                if (path) onMeta({ cover_image: path });
              })
            }
            style={ghostOnPhoto}
          >
            <ImagePlus size={13} /> {journey.cover_image ? L('Change cover', 'কভার বদলান') : L('Add a cover photo', 'কভার ছবি দিন')}
          </button>
          {journey.cover_image && (
            <button onClick={() => onMeta({ cover_image: '' })} aria-label={L('Remove cover', 'কভার সরান')} style={ghostOnPhoto}>
              <X size={13} />
            </button>
          )}
          {journey.attach_file ? (
            <button
              onClick={() => journeyApi.openAttachFile(journey.attach_file)}
              onDoubleClick={() => onMeta({ attach_file: '' })}
              title={L('Click to open · double-click to detach', 'খুলতে ক্লিক · সরাতে ডাবল-ক্লিক')}
              style={ghostOnPhoto}
            >
              <Paperclip size={13} /> {journey.attach_file.split(/[\\/]/).pop()?.slice(0, 24)}
            </button>
          ) : (
            <button
              onClick={() =>
                journeyApi.pickAttachFile().then((path) => {
                  if (path) onMeta({ attach_file: path });
                })
              }
              title={L('Link a supporting Word/Excel/CSV file', 'Word/Excel/CSV ফাইল যুক্ত করুন')}
              style={ghostOnPhoto}
            >
              <Paperclip size={13} /> {L('Attach file', 'ফাইল যুক্ত করুন')}
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          padding: SPACE.xl,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: SPACE.xs,
          color: ON_PHOTO,
          flex: 'none',
        }}
      >
        <div
          role="img"
          aria-label={L(`${pct}% of the way`, `${pct}% পথ পেরিয়েছে`)}
          style={{
            width: 112,
            height: 112,
            borderRadius: RADIUS.pill,
            background: `conic-gradient(${ON_PHOTO} ${pct * 3.6}deg, rgba(255,255,255,.2) 0)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: RADIUS.pill,
              background: 'rgba(0,0,0,.6)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: TYPE_SIZE.xl, fontWeight: TYPE_WEIGHT.bold, lineHeight: 1 }}>{pct}%</span>
            <span style={{ fontSize: TYPE_SIZE.xs, opacity: 0.85 }}>{L('of the way', 'পথ পেরোনো')}</span>
          </div>
        </div>
        <span style={{ fontSize: TYPE_SIZE.xs, opacity: 0.9, whiteSpace: 'nowrap' }}>
          {L(`${doneTasks}/${allTasks.length} tasks · ${doneStages}/6 stages`, `${doneTasks}/${allTasks.length} কাজ · ${doneStages}/৬ ধাপ`)}
        </span>
      </div>
    </div>
  );
}

function PinTile({ pin, onRemove }: { pin: JourneyPin; onRemove: () => void }) {
  const L = useL();
  const img = useImage(pin.kind === 'image' ? pin.value : '');
  return (
    <div
      style={{
        position: 'relative',
        minHeight: 72,
        borderRadius: RADIUS.card,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        background: pin.kind === 'image' && img ? `center / cover no-repeat url("${img}")` : 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACE.sm,
        boxSizing: 'border-box',
      }}
    >
      {pin.kind === 'word' && (
        <span
          style={{
            fontSize: TYPE_SIZE.md,
            fontWeight: TYPE_WEIGHT.bold,
            textAlign: 'center',
            color: 'var(--accent)',
            fontFamily: 'Georgia, "Noto Serif Bengali", serif',
            fontStyle: 'italic',
            overflowWrap: 'anywhere',
          }}
        >
          {pin.value}
        </span>
      )}
      <button
        onClick={onRemove}
        aria-label={L('Remove pin', 'পিন সরান')}
        style={{
          position: 'absolute',
          top: SPACE.xs,
          right: SPACE.xs,
          width: 20,
          height: 20,
          padding: 0,
          border: 'none',
          borderRadius: RADIUS.pill,
          background: 'color-mix(in srgb, var(--surface) 85%, transparent)',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function VisionBoard({
  journey,
  onMeta,
}: {
  journey: Journey;
  onMeta: (patch: Parameters<typeof journeyApi.updateMeta>[1]) => void;
}) {
  const L = useL();
  const [addingWord, setAddingWord] = useState(false);
  const [word, setWord] = useState('');
  const wordRef = useAutofocus<HTMLInputElement>(addingWord);
  const pins = journey.pins;
  const full = pins.length >= 6;
  const label: React.CSSProperties = {
    fontSize: TYPE_SIZE.xs,
    fontWeight: TYPE_WEIGHT.bold,
    letterSpacing: TRACKING.wide,
    color: 'var(--accent)',
  };
  const setPins = (next: JourneyPin[]) => onMeta({ pins: next });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: SPACE.sm, alignContent: 'start' }}>
      <div
        style={{
          gridColumn: 'span 2',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: RADIUS.card,
          padding: `${SPACE.md}px ${SPACE.lg}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE.xs,
        }}
      >
        <span style={label}>{L('WHY', 'কেন')}</span>
        <textarea
          key={`${journey.project_key}-why`}
          defaultValue={journey.why}
          onBlur={(e) => e.target.value.trim() !== journey.why && onMeta({ why: e.target.value })}
          placeholder={L('Why does this matter to you?', 'এটা আপনার কাছে কেন গুরুত্বপূর্ণ?')}
          rows={2}
          style={{
            fontSize: TYPE_SIZE.md,
            fontWeight: TYPE_WEIGHT.medium,
            lineHeight: 1.35,
            fontFamily: 'Georgia, "Noto Serif Bengali", serif',
            fontStyle: 'italic',
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            resize: 'none',
            padding: 0,
          }}
        />
      </div>

      <div
        style={{
          background: 'var(--accent-light)',
          border: '1px solid var(--accent)',
          borderRadius: RADIUS.card,
          padding: SPACE.md,
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE.xs,
          minWidth: 0,
        }}
      >
        <span style={label}>{L('DONE LOOKS LIKE', 'শেষ হলে')}</span>
        <input
          key={`${journey.project_key}-vision`}
          defaultValue={journey.vision}
          onBlur={(e) => e.target.value.trim() !== journey.vision && onMeta({ vision: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="1,000"
          aria-label={L('What done looks like', 'শেষ হলে কেমন দেখাবে')}
          style={{
            fontSize: TYPE_SIZE.lg,
            fontWeight: TYPE_WEIGHT.bold,
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            padding: 0,
            width: '100%',
          }}
        />
        <input
          key={`${journey.project_key}-vision-note`}
          defaultValue={journey.vision_note}
          onBlur={(e) => e.target.value.trim() !== journey.vision_note && onMeta({ vision_note: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder={L('repeat customers', 'নিয়মিত কাস্টমার')}
          aria-label={L('Done — detail', 'শেষ — বিস্তারিত')}
          style={{
            fontSize: TYPE_SIZE.xs,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            padding: 0,
            width: '100%',
          }}
        />
      </div>

      {pins.map((p, i) => (
        <PinTile key={`${i}-${p.value}`} pin={p} onRemove={() => setPins(pins.filter((_, j) => j !== i))} />
      ))}

      {!full && (
        <div
          style={{
            minHeight: 72,
            border: '1px dashed var(--border)',
            borderRadius: RADIUS.card,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyContent: 'center',
            gap: SPACE.xs,
            padding: SPACE.sm,
          }}
        >
          {addingWord ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const w = word.trim();
                if (w) setPins([...pins, { kind: 'word', value: w }]);
                setWord('');
                setAddingWord(false);
              }}
            >
              <input
                ref={wordRef}
                value={word}
                onChange={(e) => setWord(e.target.value)}
                onBlur={() => !word.trim() && setAddingWord(false)}
                placeholder={L('A word to pin…', 'পিন করার শব্দ…')}
                style={{ width: '100%', fontSize: TYPE_SIZE.sm, padding: SPACE.xs, boxSizing: 'border-box' }}
              />
            </form>
          ) : (
            <>
              <button onClick={() => setAddingWord(true)} className="btn-ghost" style={pinAddStyle}>
                <Plus size={13} /> {L('Pin a word', 'শব্দ পিন করুন')}
              </button>
              <button
                onClick={() =>
                  journeyApi.pickCoverImage().then((path) => {
                    if (path) setPins([...pins, { kind: 'image', value: path }]);
                  })
                }
                className="btn-ghost"
                style={pinAddStyle}
              >
                <ImagePlus size={13} /> {L('Pin a photo', 'ছবি পিন করুন')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const pinAddStyle: React.CSSProperties = {
  fontSize: TYPE_SIZE.xs,
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: SPACE.xs,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
};

// The road: six stops on one winding line, drawn in a 600×100 box that
// stretches to the card's width. Strokes keep their width while the box
// stretches (vector-effect), and the stops are HTML laid over it in six
// equal columns — the same six columns as the board below, so each stop
// sits over its own stage.
function Road({ journey, onPick }: { journey: Journey; onPick: (i: number) => void }) {
  const L = useL();
  const ys = [26, 62, 26, 62, 26, 62];
  const xs = ys.map((_, i) => 50 + i * 100);
  const segs = journey.stages.map((s, i) => {
    const st = stageState(s, journey.current_stage);
    const x0 = xs[i];
    const y0 = ys[i] + 14;
    const x1 = i < 5 ? xs[i + 1] : 596;
    const y1 = i < 5 ? ys[i + 1] + 14 : 10;
    const mx = (x0 + x1) / 2;
    return {
      d: `M${x0} ${y0} C${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`,
      color: STAGE_COLOR[st],
      width: st === 'upcoming' ? 2 : 5,
      dash: st === 'done' ? undefined : st === 'current' ? '10 8' : '2 8',
    };
  });

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: RADIUS.card,
        padding: `${SPACE.md}px ${SPACE.lg}px ${SPACE.sm}px`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, flexWrap: 'wrap' }}>
        <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, letterSpacing: TRACKING.wide }}>
          {L('THE ROAD', 'পথ')}
        </span>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
          {L('each stop opens when the one before it is done', 'আগেরটা শেষ হলে পরের ধাপ খোলে')}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', gap: SPACE.md, fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
          {(
            [
              ['done', L('Done', 'শেষ')],
              ['current', L('You are here', 'আপনি এখানে')],
              ['upcoming', L('Ahead', 'সামনে')],
            ] as const
          ).map(([k, t]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE.xs }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: RADIUS.pill,
                  boxSizing: 'border-box',
                  background: k === 'upcoming' ? 'transparent' : STAGE_COLOR[k],
                  border: `2px solid ${STAGE_COLOR[k]}`,
                }}
              />
              {t}
            </span>
          ))}
        </span>
      </div>

      <div style={{ position: 'relative', height: 120 }}>
        <svg
          viewBox="0 0 600 100"
          preserveAspectRatio="none"
          aria-hidden
          style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 100 }}
        >
          {segs.map((s, i) => (
            <path
              key={i}
              d={s.d}
              stroke={s.color}
              strokeWidth={s.width}
              strokeDasharray={s.dash}
              strokeLinecap="round"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
          {journey.stages.map((s, i) => {
            const st = stageState(s, journey.current_stage);
            const color = STAGE_COLOR[st];
            const size = st === 'current' ? 36 : 28;
            return (
              <button
                key={s.stage_index}
                onClick={() => onPick(i)}
                title={s.name}
                style={{
                  marginTop: ys[i] + 14 - size / 2,
                  alignSelf: 'start',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: SPACE.xs,
                  minWidth: 0,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text)',
                }}
              >
                <span
                  className={st === 'current' ? 'journey-here' : undefined}
                  style={{
                    width: size,
                    height: size,
                    borderRadius: RADIUS.pill,
                    boxSizing: 'border-box',
                    border: `2px solid ${color}`,
                    background: st === 'upcoming' ? 'var(--surface)' : color,
                    color: st === 'upcoming' ? 'var(--text-muted)' : 'var(--on-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: TYPE_SIZE.sm,
                    fontWeight: TYPE_WEIGHT.bold,
                    flex: 'none',
                  }}
                >
                  {st === 'done' ? <Check size={14} /> : i + 1}
                </span>
                <span
                  style={{
                    fontSize: TYPE_SIZE.xs,
                    fontWeight: st === 'current' ? TYPE_WEIGHT.bold : TYPE_WEIGHT.medium,
                    color: st === 'upcoming' ? 'var(--text-muted)' : 'var(--text)',
                    background: 'var(--surface)',
                    padding: `0 ${SPACE.xs}px`,
                    maxWidth: '100%',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {s.name}
                </span>
              </button>
            );
          })}
        </div>
        <span
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: SPACE.xs,
            paddingLeft: SPACE.xs,
            background: 'var(--surface)',
            fontSize: TYPE_SIZE.xs,
            fontWeight: TYPE_WEIGHT.bold,
            color: journey.launched ? 'var(--success)' : 'var(--text-muted)',
          }}
        >
          <Rocket size={16} /> {L('LAUNCH', 'লঞ্চ')}
        </span>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'ok' ? 'var(--success)' : status === 'no' ? 'var(--danger)' : 'var(--text-faint)';
  return (
    <span style={{ color, width: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {status === 'ok' ? <Check size={12} /> : status === 'no' ? <X size={12} /> : '·'}
    </span>
  );
}

type StageActions = {
  rename: (name: string, description: string) => void;
  setGate: (gate: string) => void;
  toggleGate: () => void;
  addTask: (text: string) => void;
  toggleTask: (id: number) => void;
  editTask: (id: number, text: string) => void;
  deleteTask: (id: number) => void;
  addLog: (text: string) => void;
  cycleLog: (id: number) => void;
  deleteLog: (id: number) => void;
};

function StageCard({
  stage,
  state,
  act,
  cardRef,
}: {
  stage: JourneyStage;
  state: StageState;
  act: StageActions;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const L = useL();
  const [newTask, setNewTask] = useState('');
  const [newLog, setNewLog] = useState('');
  const [gate, setGate] = useState(stage.gate);
  const [open, setOpen] = useState(false);
  useEffect(() => setGate(stage.gate), [stage.gate]);

  const color = STAGE_COLOR[state];
  const done = stage.tasks.filter((t) => t.done).length;
  const total = stage.tasks.length;
  const isCur = state === 'current';
  const hasGate = stage.gate.trim() !== '';
  const openTasks = total - done;

  return (
    <div
      ref={cardRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: state === 'done' ? 'color-mix(in srgb, var(--success) 5%, var(--surface))' : 'var(--surface)',
        border: `${isCur ? 2 : 1}px solid ${state === 'upcoming' ? 'var(--border)' : color}`,
        borderRadius: RADIUS.card,
        overflow: 'hidden',
        boxShadow: isCur ? 'var(--shadow-sm)' : 'none',
      }}
    >
      <div style={{ height: 4, background: color }} />
      <div style={{ padding: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.sm, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 24,
              height: 24,
              flex: 'none',
              borderRadius: RADIUS.pill,
              boxSizing: 'border-box',
              border: `2px solid ${color}`,
              background: state === 'upcoming' ? 'var(--surface)' : color,
              color: state === 'upcoming' ? 'var(--text-muted)' : 'var(--on-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: TYPE_SIZE.xs,
              fontWeight: TYPE_WEIGHT.bold,
            }}
          >
            {state === 'done' ? <Check size={13} /> : stage.stage_index + 1}
          </span>
          <input
            key={`${stage.stage_index}-${stage.name}`}
            defaultValue={stage.name}
            onBlur={(e) => e.target.value.trim() && e.target.value !== stage.name && act.rename(e.target.value, stage.description)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label={L('Stage name', 'ধাপের নাম')}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: TYPE_SIZE.base,
              fontWeight: TYPE_WEIGHT.bold,
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              padding: 0,
              textOverflow: 'ellipsis',
            }}
          />
        </div>
        {isCur && (
          <span
            style={{
              alignSelf: 'flex-start',
              fontSize: TYPE_SIZE.xs,
              fontWeight: TYPE_WEIGHT.bold,
              letterSpacing: TRACKING.label,
              color: 'var(--on-accent)',
              background: 'var(--accent)',
              padding: `${SPACE.hair}px ${SPACE.sm}px`,
              borderRadius: RADIUS.pill,
            }}
          >
            {L('YOU ARE HERE', 'আপনি এখানে')}
          </span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <span style={{ flex: 1, height: 4, borderRadius: RADIUS.pill, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${total ? (done / total) * 100 : 0}%`, background: color }} />
          </span>
          <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {done}/{total}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
          {stage.tasks.map((t) => (
            <div key={t.id} className="journey-task" style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
              <button
                onClick={() => act.toggleTask(t.id)}
                aria-label={t.done ? L('Mark not done', 'অসম্পূর্ণ করুন') : L('Mark done', 'সম্পূর্ণ করুন')}
                aria-pressed={t.done}
                style={{
                  width: 18,
                  height: 18,
                  flex: 'none',
                  padding: 0,
                  borderRadius: RADIUS.control,
                  boxSizing: 'border-box',
                  border: `2px solid ${t.done ? 'var(--success)' : 'var(--border)'}`,
                  background: t.done ? 'var(--success)' : 'var(--surface)',
                  color: 'var(--on-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                {t.done && <Check size={11} strokeWidth={3.5} />}
              </button>
              <input
                key={`${t.id}-${t.text}`}
                defaultValue={t.text}
                onBlur={(e) => e.target.value.trim() && e.target.value !== t.text && act.editTask(t.id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                aria-label={L('Task', 'কাজ')}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: TYPE_SIZE.sm,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  color: t.done ? 'var(--text-muted)' : 'var(--text)',
                  textDecoration: t.done ? 'line-through' : 'none',
                }}
              />
              <button
                onClick={() => act.deleteTask(t.id)}
                aria-label={L('Remove task', 'কাজ মুছুন')}
                className="journey-task-remove"
                style={{
                  width: 20,
                  height: 20,
                  flex: 'none',
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = newTask.trim();
              if (!t) return;
              act.addTask(t);
              setNewTask('');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACE.sm,
              border: '1px dashed var(--border)',
              borderRadius: RADIUS.control,
              padding: `0 ${SPACE.sm}px`,
            }}
          >
            <Plus size={12} color="var(--text-muted)" />
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder={L('Add task', 'কাজ যোগ করুন')}
              aria-label={L('New task', 'নতুন কাজ')}
              style={{
                flex: 1,
                minWidth: 0,
                height: 28,
                fontSize: TYPE_SIZE.xs,
                border: 'none',
                background: 'transparent',
                padding: 0,
                color: 'var(--text)',
              }}
            />
          </form>
        </div>

        <span style={{ flex: 1 }} />

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: SPACE.sm,
            padding: SPACE.sm,
            borderRadius: RADIUS.control,
            border: `1px solid ${stage.gate_done ? 'var(--success)' : 'var(--border)'}`,
            background: stage.gate_done ? 'color-mix(in srgb, var(--success) 8%, var(--surface))' : 'var(--bg)',
          }}
        >
          <button
            onClick={act.toggleGate}
            disabled={!hasGate}
            aria-pressed={stage.gate_done}
            aria-label={L('Tick the gate', 'গেট টিক দিন')}
            title={hasGate ? L('Tick when this is true', 'সত্যি হলে টিক দিন') : L('Write the gate first', 'আগে গেট লিখুন')}
            style={{
              width: 16,
              height: 16,
              flex: 'none',
              marginTop: SPACE.hair,
              padding: 0,
              borderRadius: RADIUS.pill,
              boxSizing: 'border-box',
              border: `2px solid ${stage.gate_done ? 'var(--success)' : 'var(--border)'}`,
              background: stage.gate_done ? 'var(--success)' : 'var(--surface)',
              color: 'var(--on-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: hasGate ? 'pointer' : 'default',
            }}
          >
            {stage.gate_done && <Check size={10} strokeWidth={3.5} />}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.hair, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, letterSpacing: TRACKING.label, color: 'var(--text-muted)' }}>
              {L('GATE · DONE WHEN', 'গেট · শেষ হবে যখন')}
            </span>
            <textarea
              value={gate}
              onChange={(e) => setGate(e.target.value)}
              onBlur={() => gate !== stage.gate && act.setGate(gate)}
              placeholder={L('This stage is over when…', 'এই ধাপ শেষ হবে যখন…')}
              rows={2}
              style={{
                fontSize: TYPE_SIZE.xs,
                lineHeight: 1.35,
                border: 'none',
                background: 'transparent',
                color: 'var(--text)',
                padding: 0,
                resize: 'none',
              }}
            />
          </div>
        </div>

        {isCur && (
          hasGate ? (
            <button
              onClick={act.toggleGate}
              title={L('The gate is true — tick it and open the next stage', 'গেট পূরণ হয়েছে — টিক দিয়ে পরের ধাপ খুলুন')}
              style={{
                height: 36,
                borderRadius: RADIUS.control,
                border: '1px solid var(--accent)',
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                fontSize: TYPE_SIZE.sm,
                fontWeight: TYPE_WEIGHT.bold,
                cursor: 'pointer',
              }}
            >
              {L('Move forward →', 'সামনে এগোন →')}
            </button>
          ) : (
            <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {total === 0
                ? L('Add tasks or write a gate to set the finish line.', 'শেষ-রেখা ঠিক করতে কাজ যোগ করুন বা গেট লিখুন।')
                : L(
                    `${openTasks} task${openTasks === 1 ? '' : 's'} to go — finishing them moves you forward.`,
                    `আর ${openTasks}টা কাজ — শেষ করলেই সামনে এগোবেন।`
                  )}
            </span>
          )
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: SPACE.xs,
            fontSize: TYPE_SIZE.xs,
            color: 'var(--text-muted)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          {L(`Notes & log · ${stage.logs.length}`, `নোট ও লগ · ${stage.logs.length}`)}
          <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
            <textarea
              key={`${stage.stage_index}-desc-${stage.description}`}
              defaultValue={stage.description}
              onBlur={(e) => e.target.value !== stage.description && act.rename(stage.name, e.target.value)}
              placeholder={L('What this stage is about…', 'এই ধাপ কী নিয়ে…')}
              rows={2}
              style={{ fontSize: TYPE_SIZE.xs, padding: SPACE.xs, resize: 'vertical' }}
            />
            {stage.logs.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE.xs }}>
                <button
                  onClick={() => act.cycleLog(l.id)}
                  title={L('Worked? tap to cycle', 'কাজ করেছে? চাপুন')}
                  style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  <StatusDot status={l.status} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: TYPE_SIZE.xs }}>{l.text}</div>
                  <div style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>{l.date}</div>
                </div>
                <button
                  onClick={() => act.deleteLog(l.id)}
                  aria-label={L('Delete log entry', 'লগ মুছুন')}
                  style={{ padding: 0, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const t = newLog.trim();
                if (!t) return;
                act.addLog(t);
                setNewLog('');
              }}
            >
              <input
                value={newLog}
                onChange={(e) => setNewLog(e.target.value)}
                placeholder={L('+ What did you try or learn…', '+ কী চেষ্টা করলেন বা শিখলেন…')}
                style={{ width: '100%', fontSize: TYPE_SIZE.xs, padding: SPACE.xs, boxSizing: 'border-box' }}
              />
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function JourneyPanel({ initialProject }: { initialProject?: ProjectKey }) {
  const L = useL();
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [projectKey, setProjectKey] = useState<ProjectKey | null>(initialProject ?? null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [toast, setToast] = useState<React.ReactNode | null>(null);
  const [loadError, setLoadError] = useState(false);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const refreshOrder = () => projectsApi.order().then(setOrder).catch(() => setLoadError(true));

  useEffect(() => {
    projectsApi
      .order()
      .then((o) => {
        setOrder(o);
        setProjectKey((k) => k ?? (o.length ? o[0].project.key : null));
      })
      .catch(() => setLoadError(true));
  }, []);

  useAutoTimer(projectKey, order, refreshOrder);

  useEffect(() => {
    if (!projectKey) return;
    journeyApi
      .get(projectKey)
      .then(setJourney)
      .catch(() => setLoadError(true));
  }, [projectKey]);

  const apply = (p: Promise<Journey>) =>
    p
      .then((j) => {
        setJourney(j);
        if (j.event === 'launched') setToast(<><Rocket size={13} /> {L('Launched!', 'লঞ্চ হয়েছে!')}</>);
        else if (j.event === 'advanced')
          setToast(L(`Moved forward — now on ${j.stages[j.current_stage].name}`, `এগিয়েছেন — এখন ${j.stages[j.current_stage].name}`));
        if (j.event) setTimeout(() => setToast(null), 4000);
      })
      .catch(() => setLoadError(true));

  if (!journey || !projectKey) return <div>{L('Loading…', 'লোড হচ্ছে…')}</div>;

  const activeEntry = order.find((e) => e.project.key === projectKey);
  const k = projectKey;
  const onMeta = (patch: Parameters<typeof journeyApi.updateMeta>[1]) => apply(journeyApi.updateMeta(k, patch));

  const sinceMove = journey.last_move ? daysBetween(journey.last_move, todayIso()) : null;
  const moveText =
    sinceMove === null
      ? L('No steps logged yet', 'এখনো কোনো পদক্ষেপ নেই')
      : sinceMove <= 0
        ? L('Last move · today', 'শেষ পদক্ষেপ · আজ')
        : sinceMove === 1
          ? L('Last move · yesterday', 'শেষ পদক্ষেপ · গতকাল')
          : L(`Last move · ${sinceMove} days ago`, `শেষ পদক্ষেপ · ${sinceMove} দিন আগে`);
  // A quiet nudge, not an alarm: after three idle days the line turns
  // warning-coloured and names the smallest possible next step.
  const stale = sinceMove !== null && sinceMove >= 3 && !journey.launched;

  const actsFor = (i: number): StageActions => ({
    rename: (name, description) => apply(journeyApi.updateStageMeta(k, i, { name, description })),
    setGate: (gate) => apply(journeyApi.setGate(k, i, gate)),
    toggleGate: () => apply(journeyApi.toggleGate(k, i)),
    addTask: (text) => apply(journeyApi.addTask(k, i, text)),
    toggleTask: (id) => apply(journeyApi.toggleTask(id)),
    editTask: (id, text) => apply(journeyApi.editTask(id, text)),
    deleteTask: (id) => apply(journeyApi.deleteTask(id)),
    addLog: (text) => apply(journeyApi.addLog(k, i, text)),
    cycleLog: (id) => apply(journeyApi.cycleLog(id)),
    deleteLog: (id) => apply(journeyApi.deleteLog(id)),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg, paddingBottom: SPACE.xl }}>
      {/* Hover-only affordances that inline styles cannot express. */}
      <style>{`
        .journey-task .journey-task-remove { opacity: 0.35; }
        .journey-task:hover .journey-task-remove, .journey-task-remove:focus-visible { opacity: 1; }
        .journey-hero-input::placeholder { color: rgba(255,255,255,.7); }
        @keyframes journey-here { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent); } 70% { box-shadow: 0 0 0 12px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
        .journey-here { animation: journey-here 2s infinite; }
        @media (prefers-reduced-motion: reduce) { .journey-here { animation: none; } }
      `}</style>

      {loadError && (
        <div
          style={{
            fontSize: TYPE_SIZE.xs,
            color: 'var(--danger)',
            background: 'var(--surface)',
            border: '1px solid var(--danger)',
            borderRadius: RADIUS.control,
            padding: `${SPACE.sm}px ${SPACE.md}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE.sm,
          }}
        >
          {L("Couldn't load the journey — check the app is connected.", 'যাত্রা লোড হয়নি — অ্যাপ সংযুক্ত আছে কিনা দেখুন।')}
          <button
            className="btn-ghost"
            style={{ fontSize: TYPE_SIZE.xs }}
            onClick={() => {
              setLoadError(false);
              refreshOrder();
              journeyApi.get(k).then(setJourney).catch(() => setLoadError(true));
            }}
          >
            {L('Retry', 'আবার চেষ্টা')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
        {order.map((entry) => {
          const on = entry.project.key === projectKey;
          return (
            <button
              key={entry.project.key}
              onClick={() => setProjectKey(entry.project.key)}
              aria-pressed={on}
              style={{
                height: 32,
                padding: `0 ${SPACE.md}px`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: SPACE.sm,
                fontSize: TYPE_SIZE.sm,
                fontWeight: on ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal,
                borderRadius: RADIUS.pill,
                border: `1px solid ${on ? entry.project.accent_color : 'var(--border)'}`,
                background: on ? `color-mix(in srgb, ${entry.project.accent_color} 12%, var(--surface))` : 'var(--surface)',
                color: 'var(--text)',
                cursor: on ? 'default' : 'pointer',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: RADIUS.pill, background: entry.project.accent_color }} />
              {entry.number}. {entry.project.name}
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: TYPE_SIZE.xs,
            fontWeight: stale ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal,
            color: stale ? 'var(--warning)' : 'var(--text-muted)',
          }}
        >
          {moveText}
          {stale && L(' — tick one small task today', ' — আজ একটা ছোট কাজ টিক দিন')}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 420px)', gap: SPACE.lg }}>
        <Hero journey={journey} projectName={activeEntry?.project.name || projectKey} onMeta={onMeta} />
        <VisionBoard journey={journey} onMeta={onMeta} />
      </div>

      <Road journey={journey} onPick={(i) => cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })} />

      {toast && (
        <div
          role="status"
          style={{
            alignSelf: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            gap: SPACE.sm,
            background: 'var(--surface)',
            border: '1px solid var(--success)',
            color: 'var(--success)',
            borderRadius: RADIUS.pill,
            padding: `${SPACE.sm}px ${SPACE.lg}px`,
            fontSize: TYPE_SIZE.sm,
            fontWeight: TYPE_WEIGHT.bold,
          }}
        >
          {toast}
        </div>
      )}

      {/* auto-fit, so a narrow window wraps stages onto a second row
          instead of squeezing six columns until nothing reads. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: SPACE.md, alignItems: 'stretch' }}>
        {journey.stages.map((s, i) => (
          <StageCard
            key={`${projectKey}-${s.stage_index}`}
            stage={s}
            state={stageState(s, journey.current_stage)}
            act={actsFor(i)}
            cardRef={(el) => {
              cardRefs.current[i] = el;
            }}
          />
        ))}
      </div>
    </div>
  );
}

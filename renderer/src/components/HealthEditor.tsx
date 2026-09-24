import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Minus, Plus, RotateCcw, ThumbsDown, X } from 'lucide-react';
import { HealthExercise, HealthFood, HealthScope, HealthState, healthApi } from '../services/api';
import { useL } from '../i18n';
import { RADIUS, SPACE } from '../spacing';
import { TRACKING, TYPE_SIZE, TYPE_WEIGHT } from '../typography';

// Editing one day of the Health plan. Every change is a draft until its
// section's Save, and Save asks how far the change should reach: only
// this date, every same weekday, or every day of the plan. The engine
// keeps the default underneath, so Reset always brings it back.

type Part = { food: string; qty: number };
type Move = { name: string; dose: string };

const label: React.CSSProperties = { fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, letterSpacing: TRACKING.wide };
const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: RADIUS.card,
  padding: SPACE.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.sm,
};
const btn: React.CSSProperties = {
  height: 28,
  padding: `0 ${SPACE.md}px`,
  fontSize: TYPE_SIZE.xs,
  border: '1px solid var(--border)',
  borderRadius: RADIUS.control,
  background: 'var(--surface)',
  color: 'var(--text)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: SPACE.xs,
  cursor: 'pointer',
};
const iconBtn: React.CSSProperties = { ...btn, width: 24, height: 24, padding: 0, justifyContent: 'center' };
const primary: React.CSSProperties = {
  ...btn,
  border: '1px solid var(--accent)',
  background: 'var(--accent)',
  color: 'var(--on-accent)',
  fontWeight: TYPE_WEIGHT.bold,
};
const select: React.CSSProperties = {
  height: 28,
  fontSize: TYPE_SIZE.xs,
  border: '1px solid var(--border)',
  borderRadius: RADIUS.control,
  background: 'var(--surface)',
  color: 'var(--text)',
  padding: `0 ${SPACE.xs}px`,
  minWidth: 0,
};

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        fontSize: TYPE_SIZE.xs,
        padding: `${SPACE.xs}px ${SPACE.md}px`,
        borderRadius: RADIUS.pill,
        border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
        background: on ? 'var(--accent-light)' : 'var(--surface)',
        color: on ? 'var(--accent)' : 'var(--text)',
        fontWeight: on ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal,
        cursor: 'pointer',
      }}
    >
      {on ? '✓ ' : ''}
      {children}
    </button>
  );
}

export default function HealthEditor({
  state,
  setState,
  onDone,
}: {
  state: Required<HealthState>;
  setState: (s: HealthState) => void;
  onDone: () => void;
}) {
  const L = useL();
  const { day } = state;
  const profile = state.profile!;
  const weekdayName = new Date(`${day.day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
  const dateName = new Date(`${day.day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

  const [scope, setScope] = useState<HealthScope>('day');
  const [foods, setFoods] = useState<HealthFood[]>([]);
  const [exercises, setExercises] = useState<HealthExercise[]>([]);
  const [meals, setMeals] = useState<Part[][]>([]);
  const [blocks, setBlocks] = useState<Move[][]>([]);
  const [dirtyMeals, setDirtyMeals] = useState<Set<number>>(new Set());
  const [dirtyBlocks, setDirtyBlocks] = useState<Set<number>>(new Set());
  const [swapFor, setSwapFor] = useState<{ slot: number; i: number; options: { name: string; kcal: number; protein_g: number }[] } | null>(null);
  const [category, setCategory] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState('');

  const reloadLibrary = () =>
    healthApi.library().then((l) => {
      setFoods(l.foods);
      setExercises(l.exercises);
    });
  useEffect(() => {
    reloadLibrary();
  }, []);

  // Re-seed drafts whenever the server's version of the day changes
  // (after a save, reset or diet change) — but not the sections that are
  // still being edited.
  useEffect(() => {
    setMeals((prev) => day.meals.map((m, s) => (dirtyMeals.has(s) && prev[s] ? prev[s] : m.parts.map((p) => ({ food: p.food, qty: p.qty })))));
    setBlocks((prev) =>
      day.workout.blocks.map((b, i) => (dirtyBlocks.has(i) && prev[i] ? prev[i] : b.moves.map(([name, dose]) => ({ name, dose }))))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const foodBy = useMemo(() => Object.fromEntries(foods.map((f) => [f.name, f])), [foods]);
  const diet = profile.diet ?? [];
  const dislikes = profile.dislikes ?? [];

  const touchMeal = (slot: number, next: Part[]) => {
    setMeals((m) => m.map((x, i) => (i === slot ? next : x)));
    setDirtyMeals((d) => new Set(d).add(slot));
  };
  const touchBlock = (bi: number, next: Move[]) => {
    setBlocks((b) => b.map((x, i) => (i === bi ? next : x)));
    setDirtyBlocks((d) => new Set(d).add(bi));
  };
  const fail = () => setError(L('Could not save that change.', 'পরিবর্তন সেভ হয়নি।'));

  const saveMeal = (slot: number) =>
    healthApi
      .setMealItems(day.day, slot, meals[slot], scope)
      .then((s) => {
        setDirtyMeals((d) => {
          const n = new Set(d);
          n.delete(slot);
          return n;
        });
        setState(s);
      })
      .catch(fail);
  const saveBlock = (bi: number) =>
    healthApi
      .setBlockMoves(day.day, bi, blocks[bi], scope)
      .then((s) => {
        setDirtyBlocks((d) => {
          const n = new Set(d);
          n.delete(bi);
          return n;
        });
        setState(s);
      })
      .catch(fail);
  const reset = (sc: HealthScope) =>
    healthApi
      .reset(day.day, sc)
      .then((s) => {
        setDirtyMeals(new Set());
        setDirtyBlocks(new Set());
        setConfirmAll(false);
        setState(s);
      })
      .catch(fail);

  const scopeName = (sc: HealthScope | null) =>
    sc === 'day'
      ? L('edited for this day', 'শুধু এই দিনের জন্য বদলানো')
      : sc === 'weekday'
        ? L(`edited for every ${weekdayName}`, `প্রতি ${weekdayName} বদলানো`)
        : sc === 'all'
          ? L('edited for every day', 'সব দিনের জন্য বদলানো')
          : '';

  const kcalOf = (parts: Part[]) => parts.reduce((n, p) => n + (foodBy[p.food]?.kcal ?? 0) * p.qty, 0);
  const protOf = (parts: Part[]) => parts.reduce((n, p) => n + (foodBy[p.food]?.protein_g ?? 0) * p.qty, 0);
  const groups = ['grain', 'protein', 'veg', 'fruit', 'snack'];
  const groupName: Record<string, string> = {
    grain: L('Grains', 'শস্য'),
    protein: L('Protein', 'প্রোটিন'),
    veg: L('Vegetables', 'সবজি'),
    fruit: L('Fruit', 'ফল'),
    snack: L('Snacks', 'নাস্তা'),
  };
  const categories = ['all', 'strength', 'cardio', 'core', 'flexibility'];
  const equipments = ['all', ...Array.from(new Set(exercises.map((e) => e.equipment)))];
  const shownExercises = exercises.filter((e) => (category === 'all' || e.category === category) && (equipment === 'all' || e.equipment === equipment));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        <button onClick={onDone} style={btn}>
          <ArrowLeft size={13} /> {L('Back to the week', 'সপ্তাহে ফিরুন')}
        </button>
        <span style={{ flex: 1 }} />
        <button onClick={() => reset('day')} style={btn} title={L("Drop this date's own edits", 'এই তারিখের বদল মুছুন')}>
          <RotateCcw size={13} /> {L('Reset this day', 'এই দিন রিসেট')}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
        <span style={{ ...label, color: 'var(--success)' }}>{L('HEALTH · EDIT', 'স্বাস্থ্য · বদলানো')}</span>
        <span style={{ fontSize: TYPE_SIZE.lg, fontWeight: TYPE_WEIGHT.bold }}>{L(`Edit ${dateName}`, `${dateName} বদলান`)}</span>
        <span style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)' }}>
          {L('Change anything. Reset brings the default back.', 'যা খুশি বদলান। রিসেট চাপলে আগেরটা ফিরে আসবে।')}
        </span>
      </div>

      <div style={{ ...card, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{L('Save changes to', 'পরিবর্তন লাগবে')}</span>
        <Chip on={scope === 'day'} onClick={() => setScope('day')}>
          {L('Only this day', 'শুধু এই দিন')}
        </Chip>
        <Chip on={scope === 'weekday'} onClick={() => setScope('weekday')}>
          {L(`Every ${weekdayName}`, `প্রতি ${weekdayName}`)}
        </Chip>
        <Chip on={scope === 'all'} onClick={() => setScope('all')}>
          {L('Every day', 'সব দিন')}
        </Chip>
      </div>

      <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ ...label, color: 'var(--text-muted)' }}>{L('DIET', 'খাদ্যাভ্যাস')}</span>
        {[
          ['vegetarian', L('Vegetarian (eggs ok)', 'নিরামিষ (ডিম চলবে)')],
          ['no_beef', L('No beef', 'গরুর মাংস না')],
        ].map(([k, t]) => (
          <Chip
            key={k}
            on={diet.includes(k)}
            onClick={() =>
              healthApi
                .setDiet(diet.includes(k) ? diet.filter((x) => x !== k) : [...diet, k])
                .then((s) => {
                  setState(s);
                  reloadLibrary();
                })
                .catch(fail)
            }
          >
            {t}
          </Chip>
        ))}
      </div>

      {error && <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--danger)' }}>{error}</span>}

      <span style={label}>{L('MEALS', 'খাবার')}</span>
      {day.meals.map((m) => {
        const parts = meals[m.slot] ?? [];
        const dirty = dirtyMeals.has(m.slot);
        return (
          <div key={m.slot} style={card}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, flexWrap: 'wrap' }}>
              <span style={{ ...label, letterSpacing: TRACKING.label, color: 'var(--warning)' }}>
                {m.name.toUpperCase()} · {m.time}
              </span>
              {m.edited && !dirty && <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{scopeName(m.edited)}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold }}>
                ≈ {Math.round(kcalOf(parts))} kcal · {Math.round(protOf(parts))} g {L('protein', 'প্রোটিন')}
              </span>
            </div>
            {parts.map((p, i) => {
              const f = foodBy[p.food];
              const disliked = dislikes.includes(p.food);
              return (
                <div key={`${p.food}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, borderBottom: '1px solid var(--surface-2)', paddingBottom: SPACE.xs }}>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.medium }}>{p.food}</span>
                      <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
                        {f ? `${f.portion} · ≈ ${Math.round(f.kcal * p.qty)} kcal · ${Math.round(f.protein_g * p.qty)} g` : ''}
                      </span>
                    </span>
                    <button
                      onClick={() =>
                        healthApi
                          .swaps(p.food)
                          .then((options) => setSwapFor(swapFor?.slot === m.slot && swapFor.i === i ? null : { slot: m.slot, i, options }))
                          .catch(fail)
                      }
                      style={btn}
                    >
                      ⇄ {L('Swap', 'বদলান')}
                    </button>
                    <button
                      onClick={() => healthApi.setDislike(p.food, !disliked).then((s) => { setState(s); reloadLibrary(); }).catch(fail)}
                      aria-pressed={disliked}
                      title={disliked ? L('Marked as disliked — never suggested', 'অপছন্দ — আর প্রস্তাব হবে না') : L("Don't like this", 'এটা পছন্দ না')}
                      style={{ ...iconBtn, color: disliked ? 'var(--danger)' : 'var(--text-muted)', borderColor: disliked ? 'var(--danger)' : 'var(--border)' }}
                    >
                      <ThumbsDown size={12} />
                    </button>
                    <span style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: RADIUS.control }}>
                      <button
                        onClick={() => touchMeal(m.slot, parts.map((x, j) => (j === i ? { ...x, qty: Math.max(0.5, x.qty - 0.5) } : x)))}
                        aria-label={L('Less', 'কম')}
                        style={{ ...iconBtn, border: 'none' }}
                      >
                        <Minus size={12} />
                      </button>
                      <span style={{ fontSize: TYPE_SIZE.xs, minWidth: 32, textAlign: 'center' }}>{p.qty}×</span>
                      <button
                        onClick={() => touchMeal(m.slot, parts.map((x, j) => (j === i ? { ...x, qty: Math.min(10, x.qty + 0.5) } : x)))}
                        aria-label={L('More', 'বেশি')}
                        style={{ ...iconBtn, border: 'none' }}
                      >
                        <Plus size={12} />
                      </button>
                    </span>
                    <button
                      onClick={() => touchMeal(m.slot, parts.filter((_, j) => j !== i))}
                      disabled={parts.length === 1}
                      aria-label={L('Remove', 'মুছুন')}
                      style={{ ...iconBtn, border: 'none', color: 'var(--text-muted)' }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {swapFor?.slot === m.slot && swapFor.i === i && (
                    <div
                      style={{
                        display: 'flex',
                        gap: SPACE.sm,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        padding: SPACE.sm,
                        borderRadius: RADIUS.control,
                        background: 'color-mix(in srgb, var(--warning) 8%, var(--surface))',
                      }}
                    >
                      <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--warning)', fontWeight: TYPE_WEIGHT.bold }}>
                        {swapFor.options.length ? L('Similar protein:', 'কাছাকাছি প্রোটিন:') : L('No alternatives fit your diet.', 'আপনার খাদ্যাভ্যাসে মেলে এমন বিকল্প নেই।')}
                      </span>
                      {swapFor.options.map((o) => (
                        <button
                          key={o.name}
                          onClick={() => {
                            touchMeal(m.slot, parts.map((x, j) => (j === i ? { ...x, food: o.name } : x)));
                            setSwapFor(null);
                          }}
                          style={btn}
                        >
                          {o.name} · {o.protein_g} g
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value=""
                onChange={(e) => e.target.value && touchMeal(m.slot, [...parts, { food: e.target.value, qty: 1 }])}
                aria-label={L('Add food', 'খাবার যোগ করুন')}
                style={{ ...select, flex: 1 }}
              >
                <option value="">{L('+ Add food…', '+ খাবার যোগ…')}</option>
                {groups.map((g) => (
                  <optgroup key={g} label={groupName[g]}>
                    {foods
                      .filter((f) => f.group === g && f.allowed && !f.disliked)
                      .map((f) => (
                        <option key={f.name} value={f.name}>
                          {f.name} · {f.portion} · ≈ {f.kcal} kcal
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <button onClick={() => saveMeal(m.slot)} disabled={!dirty} style={{ ...primary, opacity: dirty ? 1 : 0.4, cursor: dirty ? 'pointer' : 'default' }}>
                {L('Save', 'সেভ')}
              </button>
            </div>
          </div>
        );
      })}

      <span style={label}>{L('WORKOUT', 'ব্যায়াম')}</span>
      {day.workout.blocks.length === 0 ? (
        <div style={{ ...card, fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)' }}>
          {L('Rest day — nothing to edit.', 'বিশ্রামের দিন — বদলানোর কিছু নেই।')}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{L('Library:', 'লাইব্রেরি:')}</span>
            {categories.map((c) => (
              <Chip key={c} on={category === c} onClick={() => setCategory(c)}>
                {c === 'all' ? L('All', 'সব') : c[0].toUpperCase() + c.slice(1)}
              </Chip>
            ))}
            <select value={equipment} onChange={(e) => setEquipment(e.target.value)} aria-label={L('Equipment', 'সরঞ্জাম')} style={select}>
              {equipments.map((q) => (
                <option key={q} value={q}>
                  {q === 'all' ? L('Any equipment', 'যেকোনো সরঞ্জাম') : q}
                </option>
              ))}
            </select>
          </div>
          {day.workout.blocks.map((b, bi) => {
            const moves = blocks[bi] ?? [];
            const dirty = dirtyBlocks.has(bi);
            return (
              <div key={b.name} style={card}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
                  <span style={{ ...label, letterSpacing: TRACKING.label, color: 'var(--accent)' }}>{b.name.toUpperCase()}</span>
                  {b.edited && !dirty && <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{scopeName(b.edited)}</span>}
                </div>
                {moves.map((mv, i) => (
                  <div key={mv.name} style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, borderBottom: '1px solid var(--surface-2)', paddingBottom: SPACE.xs }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.medium }}>{mv.name}</span>
                    <input
                      value={mv.dose}
                      onChange={(e) => touchBlock(bi, moves.map((x, j) => (j === i ? { ...x, dose: e.target.value } : x)))}
                      aria-label={L('Sets / reps / time', 'সেট / রেপ / সময়')}
                      style={{ ...select, width: 110, padding: `0 ${SPACE.sm}px` }}
                    />
                    <button
                      onClick={() => touchBlock(bi, moves.filter((_, j) => j !== i))}
                      disabled={moves.length === 1}
                      aria-label={L('Remove', 'মুছুন')}
                      style={{ ...iconBtn, border: 'none', color: 'var(--text-muted)' }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value=""
                    onChange={(e) => {
                      const ex = exercises.find((x) => x.name === e.target.value);
                      if (ex) touchBlock(bi, [...moves, { name: ex.name, dose: ex.dose }]);
                    }}
                    aria-label={L('Add from library', 'লাইব্রেরি থেকে যোগ')}
                    style={{ ...select, flex: 1 }}
                  >
                    <option value="">{L('+ Add from library…', '+ লাইব্রেরি থেকে যোগ…')}</option>
                    {shownExercises
                      .filter((x) => !moves.some((mv) => mv.name === x.name))
                      .map((x) => (
                        <option key={x.name} value={x.name}>
                          {x.name} · {x.equipment} · {'●'.repeat(x.level)}
                          {'○'.repeat(3 - x.level)}
                        </option>
                      ))}
                  </select>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = (custom[bi] ?? '').trim();
                      if (!n || moves.some((mv) => mv.name === n)) return;
                      touchBlock(bi, [...moves, { name: n, dose: '' }]);
                      setCustom((c) => ({ ...c, [bi]: '' }));
                    }}
                    style={{ display: 'flex', gap: SPACE.xs }}
                  >
                    <input
                      value={custom[bi] ?? ''}
                      onChange={(e) => setCustom((c) => ({ ...c, [bi]: e.target.value }))}
                      placeholder={L('Custom move', 'নিজের ব্যায়াম')}
                      style={{ ...select, width: 130, padding: `0 ${SPACE.sm}px` }}
                    />
                  </form>
                  <button onClick={() => saveBlock(bi)} disabled={!dirty} style={{ ...primary, opacity: dirty ? 1 : 0.4, cursor: dirty ? 'pointer' : 'default' }}>
                    {L('Save', 'সেভ')}
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <div style={{ ...card, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', flex: 1 }}>
          {L('Back to the default plan:', 'আগের (ডিফল্ট) প্ল্যানে ফিরুন:')}
        </span>
        <button onClick={() => reset('weekday')} style={btn}>
          <RotateCcw size={13} /> {L(`Every ${weekdayName}`, `প্রতি ${weekdayName}`)}
        </button>
        {confirmAll ? (
          <>
            <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--danger)' }}>{L('Undo every edit?', 'সব বদল মুছবেন?')}</span>
            <button onClick={() => reset('all')} style={{ ...btn, borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              {L('Yes, reset all', 'হ্যাঁ, সব রিসেট')}
            </button>
            <button onClick={() => setConfirmAll(false)} style={btn}>
              {L('Cancel', 'বাতিল')}
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmAll(true)} style={btn}>
            <RotateCcw size={13} /> {L('Whole plan', 'পুরো প্ল্যান')}
          </button>
        )}
      </div>
    </div>
  );
}

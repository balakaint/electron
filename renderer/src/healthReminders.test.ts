/**
 * Run: npm run test:reminders
 *
 * Reminders are only worth having if they stay quiet when they should:
 * nothing when off, nothing for a ticked meal, nothing once a window
 * has passed, never twice for the same key, and water only when behind.
 */
import type { HealthReminders } from './services/api';
import { dueReminders, ReminderInput } from './healthReminders';

let bad = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const settings: HealthReminders = {
  enabled: true,
  meals: true,
  meal_times: ['08:00', '13:30', '17:00', '20:30'],
  water: true,
  water_every: 90,
  water_from: '09:00',
  water_to: '21:00',
  workout: true,
  workout_time: '18:00',
};
const base: ReminderInput = {
  day: '2026-09-26',
  settings,
  meals: [0, 1, 2, 3].map((slot) => ({ slot, name: ['Breakfast', 'Lunch', 'Snack', 'Dinner'][slot], items: 'x' })),
  eaten: [],
  water: 0,
  waterTarget: 10,
  workout: { name: 'Strength A', minutes: 30, rest: false, done: false },
};
const at = (hhmm: string) => new Date(`2026-09-26T${hhmm}:00`);
const kinds = (now: string, x: Partial<ReminderInput> = {}, fired: string[] = []) =>
  dueReminders(at(now), { ...base, ...x }, new Set(fired)).map((d) => d.key);

t('off: nothing', kinds('13:40', { settings: { ...settings, enabled: false } }), []);
t('another day: nothing', kinds('13:40', { day: '2026-09-25' }), []);
t('lunch at 13:30', kinds('13:30', { water: 10 }), ['2026-09-26:meal:1']);
t('lunch still due at 14:29', kinds('14:29', { water: 10 }), ['2026-09-26:meal:1']);
t('lunch window over at 14:30', kinds('14:30', { water: 10 }), []);
t('ticked lunch: quiet', kinds('13:40', { eaten: [1], water: 10 }), []);
t('never twice', kinds('13:40', { water: 10 }, ['2026-09-26:meal:1']), []);
t('meals switched off', kinds('13:40', { water: 10, settings: { ...settings, meals: false } }), []);
t('workout at 18:00', kinds('18:10', { water: 10 }), ['2026-09-26:workout']);
t('rest day: no workout', kinds('18:10', { water: 10, workout: { ...base.workout, rest: true } }), []);
t('done workout: quiet', kinds('18:10', { water: 10, workout: { ...base.workout, done: true } }), []);
t('water: none in the first interval', kinds('10:00', { eaten: [0] }), []);
// 12:00 = 180 of 720 min → 2 of 10 glasses expected; bucket 2.
t('water behind pace', kinds('12:00', { eaten: [0], water: 1 }), ['2026-09-26:water:2']);
t('water on pace: quiet', kinds('12:00', { eaten: [0], water: 2 }), []);
t('water once per interval', kinds('12:00', { eaten: [0], water: 1 }, ['2026-09-26:water:2']), []);
t('water after the window: quiet', kinds('21:30', { eaten: [0, 1, 2, 3], water: 0, workout: { ...base.workout, done: true } }), []);

if (bad) {
  console.log(`${bad} failed`);
  process.exit(1);
}
console.log('reminder checks clean');

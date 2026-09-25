// Health reminders: which notifications are due right now. Pure, so it
// is testable (healthReminders.test.ts); HealthReminderRunner calls it
// once a minute while the app is open and shows what it returns.
//
// Each reminder has a key and fires at most once per key (the runner
// remembers fired keys for the day). The rules keep it quiet:
// - a meal: from its time, for an hour, only while it isn't ticked;
// - the workout: from its time, for 90 minutes, only if not done and
//   not a rest day;
// - water: once per interval inside the from–to window, only when the
//   glasses so far are behind an even pace to the day's target.
import type { HealthReminders } from './services/api';

export interface ReminderInput {
  day: string; // YYYY-MM-DD the input describes
  settings: HealthReminders;
  meals: { slot: number; name: string; items: string }[];
  eaten: number[];
  water: number;
  waterTarget: number;
  workout: { name: string; minutes: number; rest: boolean; done: boolean };
}

export type Due =
  | { key: string; kind: 'meal'; slot: number; name: string; items: string }
  | { key: string; kind: 'workout'; name: string; minutes: number }
  | { key: string; kind: 'water'; water: number; expected: number; target: number };

export const MEAL_WINDOW = 60;
export const WORKOUT_WINDOW = 90;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function localDay(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function dueReminders(now: Date, x: ReminderInput, fired: Set<string>): Due[] {
  const s = x.settings;
  if (!s.enabled || x.day !== localDay(now)) return [];
  const t = now.getHours() * 60 + now.getMinutes();
  const out: Due[] = [];
  const within = (start: number, len: number) => t >= start && t < start + len;

  if (s.meals) {
    for (const m of x.meals) {
      const key = `${x.day}:meal:${m.slot}`;
      if (!x.eaten.includes(m.slot) && within(toMinutes(s.meal_times[m.slot]), MEAL_WINDOW) && !fired.has(key)) {
        out.push({ key, kind: 'meal', slot: m.slot, name: m.name, items: m.items });
      }
    }
  }

  if (s.workout && !x.workout.rest && !x.workout.done) {
    const key = `${x.day}:workout`;
    if (within(toMinutes(s.workout_time), WORKOUT_WINDOW) && !fired.has(key)) {
      out.push({ key, kind: 'workout', name: x.workout.name, minutes: x.workout.minutes });
    }
  }

  if (s.water) {
    const from = toMinutes(s.water_from);
    const to = toMinutes(s.water_to);
    if (t > from && t <= to) {
      const bucket = Math.floor((t - from) / s.water_every);
      const key = `${x.day}:water:${bucket}`;
      const expected = Math.floor((x.waterTarget * (t - from)) / (to - from));
      if (bucket > 0 && x.water < expected && !fired.has(key)) {
        out.push({ key, kind: 'water', water: x.water, expected, target: x.waterTarget });
      }
    }
  }
  return out;
}

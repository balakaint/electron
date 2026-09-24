// Which steps of Morning Ritual and Night Closure are done, read off the
// records the server already keeps — no step index is stored anywhere.
// Pure, so ritualSteps.test.ts can pin the rules, and shared, so the
// Discipline card and both flows count the same way.

import type { MorningRitual, NightClosure } from './services/api';

export type StepState = 'done' | 'now' | 'next';

export interface Step {
  key: string;
  en: string;
  bn: string;
  state: StepState;
}

// The first not-done step is "now"; everything after it is "next".
function sequence(items: { key: string; en: string; bn: string; done: boolean }[]): Step[] {
  let nowGiven = false;
  return items.map((i) => {
    if (i.done) return { key: i.key, en: i.en, bn: i.bn, state: 'done' as const };
    if (!nowGiven) {
      nowGiven = true;
      return { key: i.key, en: i.en, bn: i.bn, state: 'now' as const };
    }
    return { key: i.key, en: i.en, bn: i.bn, state: 'next' as const };
  });
}

export function morningSteps(r: MorningRitual): Step[] {
  const gentle = r.morning_mode === 'gentle';
  return sequence([
    { key: 'checkin', en: 'Check-in', bn: 'চেক-ইন', done: r.energy !== null && r.mood !== null },
    {
      key: 'reset',
      en: 'Reset',
      bn: 'রিসেট',
      // Gentle mode hides Day Light, so it cannot be owed there.
      done: r.reset_water && r.reset_breathe && r.reset_move && (gentle || r.reset_daylight),
    },
    { key: 'mind', en: 'Clear mind', bn: 'মন খালি', done: r.journal_text.trim() !== '' || r.journal_released },
    {
      key: 'prime',
      en: 'Prime',
      bn: 'প্রাইম',
      // "Pick any": one practice is enough.
      done:
        r.prime_meditation ||
        r.prime_visualization ||
        r.prime_reading ||
        r.prime_gratitude.trim() !== '' ||
        r.prime_intention !== null,
    },
    { key: 'ready', en: 'Ready', bn: 'প্রস্তুত', done: r.started_first_action_at !== null },
  ]);
}

export function nightWritten(n: NightClosure): number {
  return [n.where_stopped, n.unfinished, n.tomorrow_outcome, n.tomorrow_first_action].filter((v) => v.trim() !== '').length;
}

export function nightSteps(n: NightClosure): Step[] {
  return sequence([
    { key: 'today', en: 'Close today', bn: 'আজ বন্ধ', done: n.where_stopped.trim() !== '' && n.unfinished.trim() !== '' },
    {
      key: 'tomorrow',
      en: 'Set tomorrow',
      bn: 'কাল ঠিক করা',
      done: n.tomorrow_outcome.trim() !== '' && n.tomorrow_first_action.trim() !== '',
    },
    { key: 'close', en: 'Close the day', bn: 'দিন বন্ধ', done: n.closed_at !== null },
  ]);
}

// Evening runs from the evening phase start until the morning phase
// start (it wraps midnight). The Discipline card leads with Night
// Closure then, and with Morning Ritual the rest of the day.
export function isEvening(hour: number, eveningStart: number, morningStart: number): boolean {
  return eveningStart <= morningStart ? hour >= eveningStart && hour < morningStart : hour >= eveningStart || hour < morningStart;
}

// Minutes until `targetHour` today (or tomorrow, once it has passed),
// or null when it is more than `withinHours` away.
export function minutesUntil(now: Date, targetHour: number, withinHours = 6): number | null {
  const t = new Date(now);
  t.setHours(targetHour, 0, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  const mins = Math.round((t.getTime() - now.getTime()) / 60000);
  return mins <= withinHours * 60 ? mins : null;
}

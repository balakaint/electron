/**
 * Run:
 *   npx esbuild renderer/src/ritualSteps.test.ts --bundle --platform=node \
 *     --format=cjs --outfile=/tmp/rs.cjs && node /tmp/rs.cjs
 *
 * The Discipline card and both ritual flows print these steps as facts
 * ("2 of 5", "Set tomorrow · now"). The rules worth pinning are the
 * ones a quick reading gets wrong: Gentle mode has no Day Light to owe,
 * whitespace is not writing, Prime needs any ONE practice, and evening
 * wraps midnight.
 */
import type { MorningRitual, NightClosure } from './services/api';
import { isEvening, minutesUntil, morningSteps, nightSteps, nightWritten } from './ritualSteps';

let bad = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const blankMorning: MorningRitual = {
  day: '2026-09-26', today_outcome: '', first_move: '', carried_from_date: null,
  energy: null, mood: null, sleep_quality: null, wake_up_time: null, morning_mode: 'standard',
  reset_breathe: false, reset_move: false, reset_daylight: false, reset_water: false,
  journal_text: '', journal_action_needed: null, journal_released: false,
  prime_meditation: false, prime_visualization: false, prime_reading: false, prime_gratitude: '',
  prime_intention: null, prime_spiritual: 'OFF', completed: false, started_at: null,
  started_first_action_at: null, completed_at: null, kpi_seconds: null,
};
const m = (patch: Partial<MorningRitual>) => morningSteps({ ...blankMorning, ...patch }).map((s) => s.state);

t('nothing done: first step is now', m({}), ['now', 'next', 'next', 'next', 'next']);
t('check-in needs energy AND mood', m({ energy: 'GOOD' }), ['now', 'next', 'next', 'next', 'next']);
t('check-in done', m({ energy: 'GOOD', mood: 'GOOD' }), ['done', 'now', 'next', 'next', 'next']);
const threeResets = { reset_water: true, reset_breathe: true, reset_move: true };
t('standard reset owes Day Light', m({ energy: 'GOOD', mood: 'GOOD', ...threeResets }), ['done', 'now', 'next', 'next', 'next']);
t('gentle reset does not', m({ energy: 'LOW', mood: 'LOW', morning_mode: 'gentle', ...threeResets }), ['done', 'done', 'now', 'next', 'next']);
t('whitespace is not a cleared mind', m({ journal_text: '   ' })[2], 'next');
// Steps can be done out of order; a done step reads done wherever it sits.
t('released counts as cleared', m({ journal_released: true })[2], 'done');
t('…and is done once its turn comes', m({ energy: 'GOOD', mood: 'GOOD', ...threeResets, reset_daylight: true, journal_released: true }), ['done', 'done', 'done', 'now', 'next']);
t('any one prime practice is enough', morningSteps({ ...blankMorning, prime_intention: 'Calm' })[3].state, 'done');
t('ready means Start now was pressed', morningSteps({ ...blankMorning, started_first_action_at: 1 })[4].state, 'done');

const blankNight: NightClosure = {
  day: '2026-09-25', where_stopped: '', unfinished: '', tomorrow_outcome: '', tomorrow_first_action: '',
  optional_blocker: '', optional_note: '', close_time: null, closed_at: null,
};
const n = (patch: Partial<NightClosure>) => ({ ...blankNight, ...patch });
t('nothing written', nightWritten(n({})), 0);
t('whitespace is not writing', nightWritten(n({ where_stopped: ' ', unfinished: 'x' })), 1);
t('optional fields do not count', nightWritten(n({ optional_blocker: 'b', optional_note: 'n' })), 0);
t('today needs both of its fields', nightSteps(n({ where_stopped: 'a' })).map((s) => s.state), ['now', 'next', 'next']);
t('today done, tomorrow now', nightSteps(n({ where_stopped: 'a', unfinished: 'b' })).map((s) => s.state), ['done', 'now', 'next']);
t('closed without writing still reads closed', nightSteps(n({ closed_at: 1 }))[2].state, 'done');

t('evening: 8 PM with evening at 7', isEvening(20, 19, 5), true);
t('evening wraps midnight: 2 AM', isEvening(2, 19, 5), true);
t('not evening: 5 AM, the morning start', isEvening(5, 19, 5), false);
t('not evening: noon', isEvening(12, 19, 5), false);

const at = (h: number, min: number) => new Date(2026, 8, 25, h, min, 0);
t('40 minutes to an 11 PM bedtime', minutesUntil(at(22, 20), 23), 40);
t('too far off: null', minutesUntil(at(12, 0), 23), null);
t('just past bedtime: null, not 23h59m', minutesUntil(at(23, 1), 23), null);

if (bad) {
  console.error(`\n${bad} ritual-step checks failed`);
  process.exit(1);
}
console.log('ritual-step checks clean');

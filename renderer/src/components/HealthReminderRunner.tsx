import { useEffect, useRef } from 'react';
import { HealthState, healthApi } from '../services/api';
import { useLang } from '../i18n';
import { Due, dueReminders, localDay } from '../healthReminders';

// Mounted once in App. Once a minute it reads today's Health state and
// shows whatever dueReminders() says is due as a system notification.
// Clicking one brings the app forward and opens Health ('open-health').
// It only runs while the app is open — a closed app can't remind.
//
// Fired keys are kept in localStorage for the day so a reload doesn't
// repeat a reminder; if storage is unavailable it just remembers in
// memory for this session.

const STORE = 'health-reminders-fired';
const MEAL_BN = ['সকালের নাস্তা', 'দুপুরের খাবার', 'বিকেলের নাস্তা', 'রাতের খাবার'];
let memory: { day: string; keys: string[] } = { day: '', keys: [] };

function loadFired(day: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) memory = JSON.parse(raw);
  } catch {
    /* storage unavailable — keep the in-memory copy */
  }
  return new Set(memory.day === day ? memory.keys : []);
}

function saveFired(day: string, keys: Set<string>) {
  memory = { day, keys: [...keys] };
  try {
    localStorage.setItem(STORE, JSON.stringify(memory));
  } catch {
    /* in memory only */
  }
}

type L = (en: string, bn: string) => string;

export function reminderText(d: Due, L: L): { title: string; body: string } {
  if (d.kind === 'meal') {
    return { title: L(`🍽 ${d.name} time`, `🍽 ${MEAL_BN[d.slot]}-এর সময়`), body: d.items };
  }
  if (d.kind === 'workout') {
    return {
      title: L(`🏃 Workout time — ${d.name}`, `🏃 ব্যায়ামের সময় — ${d.name}`),
      body: L(`${d.minutes} min. Tick it off in Health when you're done.`, `${d.minutes} মিনিট। শেষ হলে Health-এ টিক দিন।`),
    };
  }
  return {
    title: L('💧 Water break', '💧 পানি খাওয়ার সময়'),
    body: L(
      `${d.water} of ${d.target} glasses so far — about ${d.expected} by now keeps you on pace.`,
      `এ পর্যন্ত ${d.target}-এর মধ্যে ${d.water} গ্লাস — এখন নাগাদ ${d.expected} গ্লাস হলে ঠিক গতিতে থাকবেন।`
    ),
  };
}

export async function notify(title: string, body: string, tag: string): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'default') await Notification.requestPermission().catch(() => 'denied');
  if (Notification.permission !== 'granted') return false;
  const n = new Notification(title, { body, tag });
  n.onclick = () => {
    window.focus();
    window.dispatchEvent(new Event('open-health'));
  };
  return true;
}

function inputFrom(s: HealthState) {
  if (!s.profile || !s.reminders || !s.day || !s.log || !s.targets || !s.week) return null;
  const today = s.week.find((c) => c.day === s.day?.day);
  return {
    day: s.day.day,
    settings: s.reminders,
    meals: s.day.meals.map((m) => ({ slot: m.slot, name: m.name, items: m.items })),
    eaten: s.log.meals,
    water: s.log.water,
    waterTarget: s.targets.water_glasses,
    workout: {
      name: s.day.workout.name,
      minutes: s.day.workout.minutes,
      rest: s.day.workout.blocks.length === 0,
      done: !!today?.workout_done,
    },
  };
}

export default function HealthReminderRunner() {
  // The language lives in a ref so switching it doesn't restart the timer.
  const lang = useRef(useLang());
  lang.current = useLang();
  useEffect(() => {
    let alive = true;
    const L = (en: string, bn: string) => (lang.current === 'bn' ? bn : en);
    const tick = () => {
      const now = new Date();
      const day = localDay(now);
      healthApi
        .state(day)
        .then(async (s) => {
          const x = inputFrom(s);
          if (!alive || !x || !x.settings.enabled) return;
          const fired = loadFired(day);
          for (const d of dueReminders(now, x, fired)) {
            const { title, body } = reminderText(d, L);
            // Marked fired even if the OS refused to show it, so a denied
            // permission doesn't turn into a retry every minute.
            fired.add(d.key);
            await notify(title, body, d.key);
          }
          saveFired(day, fired);
        })
        .catch(() => {
          /* engine not up yet — try again next minute */
        });
    };
    const first = setTimeout(tick, 5000);
    const every = setInterval(tick, 60_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  return null;
}

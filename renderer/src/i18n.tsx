import { createContext, useContext, type ReactNode } from 'react';

export type Lang = 'en' | 'bn';

// Legacy translates a specific, deliberately small set of labels rather
// than the whole interface: `def L(en, b): return b if bn else en`, used
// at about thirty call sites, plus two module-level tables (_SEG_LABELS_BN
// and BN_DAYS). Everything else — settings, panel bodies, buttons — stays
// English in both languages.
//
// That is ported as-is, not widened. Half-translating an app is worse
// than not translating it, and a full sweep would be a new product
// decision (and would need the Bengali reviewed by someone who writes it,
// which is not something to guess at across two hundred strings).
//
// The catalogue below is exactly the set legacy translates AND the port
// has a surface for. Legacy's Pomodoro labels (FOCUS/SHORT/LONG SESSION,
// PAUSE/START) and its HOURS / TASK LIST tri-tab are omitted because the
// port has neither of those screens.

const LangContext = createContext<Lang>('en');

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

/**
 * Legacy's `L(en, bn)`, as a hook-bound function.
 *
 * Deliberately takes both strings at the call site rather than a key into
 * a table. With a set this small, an inline pair is readable where a key
 * is not — `L('NOW', 'এখন')` says what it renders; `t('now.heading')`
 * requires a second lookup to review. It is also how legacy writes it,
 * so the two can be diffed line for line.
 */
export function useL(): (en: string, bn: string) => string {
  const lang = useLang();
  return (en, bn) => (lang === 'bn' ? bn : en);
}

// Legacy's _SEG_LABELS_BN (task_tracker_v3_THEMES.py 1220), in the same
// sleep/morning/work/evening order.
export const PHASE_LABELS_BN: Record<string, string> = {
  sleep: 'ঘুম',
  morning: 'সকাল',
  work: 'কাজ',
  evening: 'সন্ধ্যা',
};

// Legacy's BN_DAYS (1299). Monday-first, matching Python's
// date.weekday(); JavaScript's getDay() is Sunday-first, so index with
// dayIndexBn() rather than getDay() directly.
export const BN_DAYS = ['সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার', 'রবিবার'];

/** Monday-first weekday index for a Date, to line up with BN_DAYS. */
export function bnDayName(d: Date): string {
  return BN_DAYS[(d.getDay() + 6) % 7];
}

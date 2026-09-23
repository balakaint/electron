import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

// "Loading…" while pending, a "Couldn't load — check the app is
// connected." banner with a Retry button on failure, the real data once
// resolved — GoalHorizonSection and HourPlanTab each hand-rolled this
// identical loaded/loadError/refresh trio (ui-ux-audit, 2026-09-22
// flagged the duplication itself as a follow-up, not just the two bugs
// it had already caused independently in those files). One hook now, so
// a third caller doesn't hand-roll a fourth copy.
//
// `fetchFn` may be `null` to mean "not ready to fetch yet" (e.g.
// GoalHorizonSection waiting on its owner list to resolve first) — the
// hook then stays in the loading state without calling anything, rather
// than the caller needing its own separate "not loaded yet" flag on top
// of this one.
//
// Returns `setData` (not just `data`) because a toggle-style write
// (GoalHorizonSection's checkbox) wants to patch the already-fetched
// list in place for an instant UI response, not force a full refetch —
// the same optimistic-update shape both callers already used before
// this hook existed.
export function useFetchState<T>(
  fetchFn: (() => Promise<T>) | null,
  deps: unknown[],
  initial: T,
): { data: T; setData: Dispatch<SetStateAction<T>>; loaded: boolean; loadError: boolean; refresh: () => void } {
  const [data, setData] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refresh = () => {
    if (!fetchFn) return;
    setLoadError(false);
    fetchFn()
      .then((d) => {
        setData(d);
        setLoaded(true);
      })
      .catch(() => {
        setLoadError(true);
        setLoaded(true);
      });
  };

  useEffect(() => {
    // NOT setLoaded(false) here. `loaded` only ever flips false→true, on
    // the very first resolve — a deps change (e.g. Weekly/Monthly/Yearly's
    // shared refreshSignal bumping after some OTHER section's edit) then
    // refetches in place, swapping `data` in once ready, rather than
    // dropping back to the loading branch and unmounting everything that
    // was already showing. Caught live: bumping refreshSignal from inside
    // PlanningWeeklyLevel's own type-picker composer collapsed every
    // Win card's native <details> the instant it refetched itself, since
    // a remount resets that open/closed state — a real user-visible
    // regression, not just a flicker.
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, loaded, loadError, refresh };
}

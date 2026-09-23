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
    setLoaded(false);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, loaded, loadError, refresh };
}

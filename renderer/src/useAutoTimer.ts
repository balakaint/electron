import { useEffect, useRef } from 'react';
import { ProjectKey, ProjectOrderEntry, projectsApi, settingsApi } from './services/api';

// Matches legacy's _auto_timer_on_open/_auto_timer_on_close: opening a
// project's Business Analysis or Journey view starts that project's
// clock, since a manual timer has to be remembered at the exact moment
// attention is going INTO the work and furthest from the app — which
// is why it kept not getting pressed. Only stops the timer again if it
// is the one THIS hook started and it's still running — a session the
// user took over by hand, or one already stopped by switching to
// another project, must not be touched.
export function useAutoTimer(activeKey: ProjectKey | null, order: ProjectOrderEntry[], onChanged: () => void) {
  const autoStartedRef = useRef<ProjectKey | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  const stopIfStillAutoRunning = (key: ProjectKey) => {
    const entry = orderRef.current.find((e) => e.project.key === key);
    if (entry && entry.project.running_since !== null) {
      projectsApi.toggleTimer(key).then(onChanged);
    }
  };

  useEffect(() => {
    const previous = autoStartedRef.current;
    if (previous && previous !== activeKey) {
      stopIfStillAutoRunning(previous);
      autoStartedRef.current = null;
    }
    if (!activeKey) return;
    settingsApi.get().then((settings) => {
      if (!settings.auto_timer_on_open) return;
      const entry = orderRef.current.find((e) => e.project.key === activeKey);
      if (entry && entry.project.running_since === null) {
        projectsApi.toggleTimer(activeKey).then(() => {
          autoStartedRef.current = activeKey;
          onChanged();
        });
      }
    });
    // Only re-run when the active project changes — order updates on
    // every timer tick and must not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  useEffect(() => {
    return () => {
      if (autoStartedRef.current) stopIfStillAutoRunning(autoStartedRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

import { useEffect, useState } from 'react';
import { healthApi, morningRitualApi, nightClosureApi, projectsApi, type GoalOwnerKey } from '../services/api';
import { useL } from '../i18n';
import { nightWritten } from '../ritualSteps';
import { SPACE } from '../spacing';

// Panel 2's tabs. Goals, Health, Morning Ritual and Night Closure used
// to take turns in this one column with nothing to say the others were
// there — opening Health covered Goals, and the only way back was each
// page's own Back button (and opening one also hid panel 1). Now all
// four are always visible, each with one line on where it stands today,
// so what is in this column is never hidden behind whatever is open.

export type Panel2Tab = 'goals' | 'health' | 'morning' | 'night';

interface Status {
  health: string;
  healthDone: boolean;
  morning: string;
  morningDone: boolean;
  night: string;
  nightDone: boolean;
}

async function load(L: (en: string, bn: string) => string): Promise<Status> {
  const [h, m, n] = await Promise.all([
    healthApi.state().catch(() => null),
    morningRitualApi.today().catch(() => null),
    nightClosureApi.today().catch(() => null),
  ]);
  const meals = h?.profile && h.log ? h.log.meals.length : null;
  const written = n ? nightWritten(n) : 0;
  return {
    health: meals === null ? L('Set up', 'সেট আপ') : L(`${meals}/4 meals`, `${meals}/4 খাবার`),
    healthDone: meals === 4,
    morning: m?.completed ? L('Done ✓', 'শেষ ✓') : m?.started_at ? L('Started', 'শুরু হয়েছে') : L('Not yet', 'এখনো না'),
    morningDone: !!m?.completed,
    night: n?.closed_at ? L('Closed ✓', 'শেষ ✓') : L(`${written}/4 written`, `${written}/4 লেখা`),
    nightDone: !!n?.closed_at,
  };
}

export default function Panel2Tabs({
  tab,
  onSelect,
  goalsKey,
  refreshSignal,
}: {
  tab: Panel2Tab;
  onSelect: (t: Panel2Tab) => void;
  goalsKey: GoalOwnerKey | null;
  // Bumped when this column is written to, so the statuses re-read.
  refreshSignal: number;
}) {
  const L = useL();
  const [status, setStatus] = useState<Status | null>(null);
  const [goalsName, setGoalsName] = useState('');

  // Re-read on a tab switch (the page just left may have changed
  // something), on writes elsewhere, and every half minute — the same
  // polling PLAN's own status cards already use, since the four stores
  // have no shared change signal.
  useEffect(() => {
    let alive = true;
    const run = () => load(L).then((s) => alive && setStatus(s));
    run();
    const id = setInterval(run, 30_000);
    window.addEventListener('health-changed', run);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('health-changed', run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, refreshSignal]);

  useEffect(() => {
    if (!goalsKey || goalsKey === 'life') {
      setGoalsName('');
      return;
    }
    projectsApi
      .order()
      .then((o) => setGoalsName(o.find((e) => e.project.key === goalsKey)?.project.name ?? ''))
      .catch(() => setGoalsName(''));
  }, [goalsKey]);

  const tabs: [Panel2Tab, string, string, string, boolean][] = [
    ['goals', '◎', goalsKey === 'life' || !goalsKey ? L('Life Plan', 'জীবন পরিকল্পনা') : goalsName || L('Goals', 'লক্ষ্য'), L('Goals', 'লক্ষ্য'), false],
    ['health', '♥', L('Health', 'স্বাস্থ্য'), status?.health ?? '…', status?.healthDone ?? false],
    ['morning', '☀', L('Morning', 'সকাল'), status?.morning ?? '…', status?.morningDone ?? false],
    ['night', '☾', L('Night', 'রাত'), status?.night ?? '…', status?.nightDone ?? false],
  ];

  return (
    <div
      role="tablist"
      aria-label={L('Panel 2', 'প্যানেল ২')}
      style={{ display: 'flex', gap: SPACE.xs, borderBottom: '1px solid var(--border)', marginBottom: SPACE.md }}
    >
      {tabs.map(([id, icon, label, sub, done]) => {
        const on = tab === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(id)}
            title={`${label} · ${sub}`}
            style={{
              flex: id === 'goals' ? 1.6 : 1,
              minWidth: 0,
              height: 44,
              padding: `0 ${SPACE.sm}px`,
              border: 'none',
              borderBottom: `3px solid ${on ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1,
              borderRadius: 0,
              background: 'transparent',
              color: on ? 'var(--accent)' : 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: SPACE.sm,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span aria-hidden style={{ fontSize: 14, color: on ? 'var(--accent)' : 'var(--text-muted)', flex: 'none' }}>
              {icon}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', minWidth: 0, overflow: 'hidden' }}>
              <span style={{ fontSize: 13, fontWeight: on ? 700 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
              <span
                style={{
                  fontSize: 12,
                  color: done ? 'var(--success)' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {sub}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

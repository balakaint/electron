import type { Theme } from '../themes';

export type ListKey = 'classic' | 'focus';
// EXECUTE's four tabs. Stored keys, so they must match FOCUS_TABS in
// python/engine/settings.py. The HOURS tab's own body nests a further
// DAILY/WEEKLY/MONTHLY/YEARLY accordion (see Panel3.tsx / HoursLevel)
// — that nested level is intentionally not part of this persisted type.
export type FocusTab = 'hours' | 'mit' | 'list' | 'notes';

// The HOURS tab's own nested accordion levels — in-memory only (see
// Panel3.tsx), not persisted like FocusTab above.
export type HoursLevel = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type Urgency = 'low' | 'med' | 'high';
export type DayView = 'today' | 'tomorrow';

export interface Session {
  start: number;
  end: number | null;
}

export interface Task {
  id: number;
  list_key: ListKey;
  text: string;
  done: boolean;
  secs: number;
  sessions: Session[];
  est: number;
  mit: boolean;
  day: string;
  urgency: Urgency;
  strike: boolean;
  project: string | null;
  psrc: string | null;
  // The goal-task twin of psrc — set when "+ STRIKE" promoted this task
  // from a Goal's own checklist (GoalsPanel) instead of a project's.
  gsrc: string | null;
  // Set when this task was started from an hour you planned, so
  // finishing it can tick that hour back.
  hour_slot_id: number | null;
  sort_order: number;
}

export interface ExportFile {
  filename: string;
  content: string;
}

export interface ExportSaveResult {
  ok: boolean;
  cancelled?: boolean;
  folder?: string;
  filenames?: string[];
}

export type PanelLayout = 'full' | 'partial' | 'compact';

declare global {
  interface Window {
    api: {
      healthCheck: () => Promise<{ status: string }>;
      request: (method: string, path: string, body?: unknown) => Promise<unknown>;
      exportSave: (files: ExportFile[]) => Promise<ExportSaveResult>;
      pickFile: () => Promise<string | null>;
      openPath: (filePath: string) => Promise<{ ok: boolean; error: string | null }>;
      pickImage: () => Promise<string | null>;
      readImage: (filePath: string) => Promise<string | null>;
      setPanelLayout: (layout: PanelLayout) => Promise<{ ok: true }>;
      windowControl: (action: 'minimise' | 'maximise' | 'close') => Promise<{ maximised: boolean }>;
      windowState: () => Promise<{ maximised: boolean; platform: string }>;
    };
  }
}

// Every screen fetches on mount, and the window can open before the
// Python engine is listening: main.ts waits for the engine's READY
// marker OR five seconds, whichever comes first, and a cold start with
// migrations to run can exceed that. Without a retry, a request that
// lands in that gap fails once and the component it belongs to stays
// empty for the rest of the session — nothing re-fetches.
//
// That is not hypothetical: it emptied the whole clock column (day
// phases, scope stats, deep-work trend) while the projects and goals
// panels looked fine, purely because those two mount slightly later.
//
// So a connection-shaped failure is retried a few times with a short
// backoff. Only connection failures: a 404 or a 422 is an answer, and
// repeating it would just delay a real error.
const RETRY_DELAYS_MS = [150, 400, 900, 1500];

function looksLikeEngineNotUpYet(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  // The IPC bridge rethrows fetch's own failure text; an HTTP answer
  // arrives as "<status> <body>" instead.
  return !/^\s*\d{3}\b/.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function req(method: string, path: string, body?: unknown): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await window.api.request(method, path, body);
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !looksLikeEngineNotUpYet(err)) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

export const tasksApi = {
  list: (listKey?: ListKey) =>
    req('GET', listKey ? `/api/tasks?list_key=${listKey}` : '/api/tasks') as Promise<Task[]>,
  create: (text: string, listKey: ListKey) =>
    req('POST', '/api/tasks', { text, list_key: listKey }) as Promise<Task>,
  edit: (id: number, text: string) => req('PUT', `/api/tasks/${id}`, { text }) as Promise<Task>,
  remove: (id: number) => req('DELETE', `/api/tasks/${id}`) as Promise<{ ok: true }>,
  toggleDone: (id: number) => req('POST', `/api/tasks/${id}/toggle-done`) as Promise<Task>,
  setMit: (id: number) => req('POST', `/api/tasks/${id}/set-mit`) as Promise<Task>,
  cycleUrgency: (id: number) => req('POST', `/api/tasks/${id}/cycle-urgency`) as Promise<Task>,
  toggleTimer: (id: number) => req('POST', `/api/tasks/${id}/toggle-timer`) as Promise<Task>,
  resetTimer: (id: number) => req('POST', `/api/tasks/${id}/reset-timer`) as Promise<Task>,
  restoreTimer: (id: number, secs: number, sessions: Session[]) =>
    req('POST', `/api/tasks/${id}/restore-timer`, { secs, sessions }) as Promise<Task>,
  setDay: (id: number, day: string) => req('POST', `/api/tasks/${id}/day`, { day }) as Promise<Task>,
  move: (id: number, direction: -1 | 1) => req('POST', `/api/tasks/${id}/move`, { direction }) as Promise<Task[]>,
  toggleStrike: (id: number, projectKey?: string) =>
    req('POST', `/api/tasks/${id}/toggle-strike`, projectKey ? { project_key: projectKey } : undefined) as Promise<Task>,
  restore: (task: Task) => req('POST', '/api/tasks/restore', task) as Promise<Task>,
  listStrike: () => req('GET', '/api/tasks/strike') as Promise<Task[]>,
  pickedLastNight: () => req('GET', '/api/tasks/picked-last-night') as Promise<number[]>,
  getTomorrowThree: () => req('GET', '/api/tasks/tomorrow-three') as Promise<Task[]>,
  setTomorrowThree: (ids: number[]) => req('PUT', '/api/tasks/tomorrow-three', { ids }) as Promise<Task[]>,
  threeWeek: () =>
    req('GET', '/api/tasks/three-week') as Promise<{ day: string; done: number; total: number; future: boolean }[]>,
  getDayView: () => req('GET', '/api/tasks/day-view') as Promise<{ view: DayView }>,
  setDayView: (view: DayView) => req('POST', '/api/tasks/day-view', { view }) as Promise<{ view: DayView }>,
  getTitle: (listKey: ListKey) => req('GET', `/api/tasks/title?list_key=${listKey}`) as Promise<{ title: string }>,
  setTitle: (listKey: ListKey, title: string) =>
    req('POST', `/api/tasks/title?list_key=${listKey}`, { title }) as Promise<{ title: string }>,
  checkMitPrompt: () => req('GET', '/api/tasks/mit-prompt') as Promise<{ show: boolean; tasks: Task[] }>,
  capacityInsight: () => req('GET', '/api/tasks/capacity-insight') as Promise<{ insight: string | null }>,
};

export const STRIKE_MAX = 3;

export interface MindsetEntry {
  day: string;
  label: string;
  text: string;
}

// The old flat Money/Health/Relation/Mind checklist (habitsApi) and the
// separate whole-app "Life Execution Board" it powered — habit CRUD/
// toggle, day/week/monthly scoring, streak, and the Win/Reflection daily
// notes — were removed outright (Zahid, 2026-09-14: "emon task list
// mainly regular chek kora hoy na" — not actually checked regularly).
// Only the Mindset note survives, since it's a genuinely separate
// feature (PlanReview.tsx's own Mindset tab) that happened to share a
// backend file with the checklist rather than depending on it.
export const mindsetApi = {
  getMindset: (day: string) =>
    req('GET', `/api/mindset/${day}`) as Promise<{ day: string; mindset: string }>,
  setMindset: (day: string, text: string) =>
    req('PUT', `/api/mindset/${day}`, { text }) as Promise<{ day: string; mindset: string }>,
  mindsetHistory: (days = 7) =>
    req('GET', `/api/mindset/history?days=${days}`) as Promise<MindsetEntry[]>,
};

// Discipline tab's "Design Today" morning brain-dump box (2026-09-18).
// Same daily_intentions row as mindset, no history — just today's text.
export const designTodayApi = {
  getDesignToday: (day: string) =>
    req('GET', `/api/design-today/${day}`) as Promise<{ day: string; text: string }>,
  setDesignToday: (day: string, text: string) =>
    req('PUT', `/api/design-today/${day}`, { text }) as Promise<{ day: string; text: string }>,
};

export type ProjectKey = 'proj1' | 'proj2' | 'proj3' | 'proj4' | 'proj5' | 'proj6';

export interface Project {
  key: ProjectKey;
  name: string;
  accent_color: string;
  note: string;
  detail_note: string;
  note_title: string;
  note_bg: string | null;
  note_fg: string | null;
  target_minutes: number;
  running_since: number | null;
  is_named: boolean;
  secs_today: number;
  done_today: boolean;
  collapsed: boolean;
}

export interface ProjectOrderEntry {
  number: number;
  project: Project;
}

export interface TodayProgress {
  secs: number;
  target_secs: number;
  pct: number;
  projects_done: number;
  projects_total: number;
}

export type TrendDays = 30 | 90;

export interface Trend {
  days: string[];
  secs: number[];
  goal: number;
}

export interface WeekSummary {
  has_data: boolean;
  total_secs: number;
  hit_days: number;
  best_day: string | null;
  best_secs: number;
}

export interface Subtask {
  pid: string;
  project_key: ProjectKey;
  text: string;
  done: boolean;
  added_date: string;
}

export interface ActivityEntry {
  day: string;
  secs: number;
  worked: boolean;
}

export interface CirclePerson {
  id: number;
  project_key: ProjectKey | null;
  name: string;
  cadence_days: number;
  last_contact: string | null;
  gap_days: number | null;
  overdue: boolean;
}

export const projectsApi = {
  order: () => req('GET', '/api/projects/order') as Promise<ProjectOrderEntry[]>,
  get: (key: ProjectKey) => req('GET', `/api/projects/${key}`) as Promise<Project>,
  todayProgress: () => req('GET', '/api/projects/today-progress') as Promise<TodayProgress>,
  update: (key: ProjectKey, patch: Partial<Pick<Project, 'name' | 'note' | 'detail_note' | 'note_title' | 'collapsed'>>) =>
    req('PUT', `/api/projects/${key}`, patch) as Promise<Project>,
  solo: (key: ProjectKey) => req('POST', `/api/projects/${key}/solo`) as Promise<Project[]>,
  bumpTarget: (key: ProjectKey, delta: number) =>
    req('POST', `/api/projects/${key}/target`, { delta }) as Promise<Project>,
  toggleTimer: (key: ProjectKey) => req('POST', `/api/projects/${key}/toggle-timer`) as Promise<Project>,
  mark: (key: ProjectKey, day: string, mark: boolean) =>
    req('POST', `/api/projects/${key}/mark`, { day, mark }) as Promise<{ ok: true }>,
  activity: (key: ProjectKey, days = 30) =>
    req('GET', `/api/projects/${key}/activity?days=${days}`) as Promise<ActivityEntry[]>,
  listSubtasks: (key: ProjectKey) =>
    req('GET', `/api/projects/${key}/subtasks`) as Promise<Subtask[]>,
  addSubtask: (key: ProjectKey, text: string) =>
    req('POST', `/api/projects/${key}/subtasks`, { text }) as Promise<Subtask>,
  toggleSubtask: (pid: string) =>
    req('POST', `/api/projects/subtasks/${pid}/toggle`) as Promise<Subtask>,
  deleteSubtask: (pid: string) => req('DELETE', `/api/projects/subtasks/${pid}`) as Promise<{ ok: true }>,
  strikeSubtask: (pid: string) => req('POST', `/api/projects/subtasks/${pid}/strike`) as Promise<Task>,
  trend: (days?: TrendDays) =>
    req('GET', `/api/projects/trend${days ? `?days=${days}` : ''}`) as Promise<Trend>,
  getTrendDays: () => req('GET', '/api/projects/trend-days') as Promise<{ trend_days: TrendDays }>,
  setTrendDays: (days: TrendDays) =>
    req('POST', '/api/projects/trend-days', { trend_days: days }) as Promise<{ trend_days: TrendDays }>,
  weekSummary: () => req('GET', '/api/projects/week-summary') as Promise<WeekSummary>,
  deepStreak: () => req('GET', '/api/projects/streak') as Promise<{ streak_days: number }>,
};

export const nowApi = {
  get: () => req('GET', '/api/now') as Promise<Task | null>,
  setNow: (taskId: number) => req('POST', `/api/now/${taskId}`) as Promise<Task | null>,
  toggleRun: () => req('POST', '/api/now/toggle-run') as Promise<Task | null>,
  // Promote the entry written in one hour into the task NOW points at,
  // and start its clock.
  startHour: (day: string, hour: number) =>
    req('POST', `/api/now/hour/${day}/${hour}`) as Promise<Task | null>,
  complete: () => req('POST', '/api/now/complete') as Promise<Task | null>,
};

export type DecisionStatus = '' | 'GO' | 'VALIDATE' | 'PIVOT' | 'NO-GO';
export type NextPriority = '' | 'HIGH' | 'MED' | 'LOW';

export interface BusinessAnalysis {
  project_key: ProjectKey;
  idea_business: string;
  idea_problem: string;
  idea_customer: string;
  idea_goal: string;
  an_market: string;
  an_competition: string;
  an_strength: string;
  an_risk: string;
  fin_investment: string;
  fin_cost: string;
  fin_revenue: string;
  fin_profit: string;
  decision_why: string;
  decision_status: DecisionStatus;
  feelings_negative: string;
  feelings_positive: string;
  thoughts_negative: string;
  thoughts_positive: string;
  beliefs_negative: string;
  beliefs_positive: string;
  actions_negative: string;
  actions_positive: string;
  next_action: string;
  next_priority: NextPriority;
  next_deadline: string;
  next_who: string;
  next_when: string;
  next_time: string;
  next_done_when: string;
  attach_path: string;
}

export type BusinessAnalysisPatch = Partial<
  Omit<BusinessAnalysis, 'project_key' | 'decision_status' | 'next_priority'>
>;

export interface DecisionLogEntry {
  id: number;
  project_key: ProjectKey;
  date: string;
  from_status: string;
  to_status: string;
  why: string;
}

export interface LegacyBox {
  box_index: number;
  title: string;
  text: string;
}

export const businessAnalysisApi = {
  get: (key: ProjectKey) => req('GET', `/api/projects/${key}/analysis`) as Promise<BusinessAnalysis>,
  update: (key: ProjectKey, patch: BusinessAnalysisPatch) =>
    req('PUT', `/api/projects/${key}/analysis`, patch) as Promise<BusinessAnalysis>,
  setDecisionStatus: (key: ProjectKey, status: DecisionStatus) =>
    req('POST', `/api/projects/${key}/analysis/decision-status`, { status }) as Promise<BusinessAnalysis>,
  setPriority: (key: ProjectKey, priority: NextPriority) =>
    req('POST', `/api/projects/${key}/analysis/priority`, { priority }) as Promise<BusinessAnalysis>,
  getLog: (key: ProjectKey) => req('GET', `/api/projects/${key}/analysis/log`) as Promise<DecisionLogEntry[]>,
  getLegacyBoxes: (key: ProjectKey) =>
    req('GET', `/api/projects/${key}/analysis/legacy-boxes`) as Promise<LegacyBox[]>,
  pickAttachFile: () => window.api.pickFile(),
  openAttachFile: (filePath: string) => window.api.openPath(filePath),
};

export const circleApi = {
  list: (projectKey: ProjectKey) =>
    req('GET', `/api/circle?project_key=${projectKey}`) as Promise<CirclePerson[]>,
  add: (projectKey: ProjectKey, name: string, cadenceDays = 7) =>
    req('POST', '/api/circle', {
      project_key: projectKey,
      name,
      cadence_days: cadenceDays,
    }) as Promise<CirclePerson>,
  markContacted: (id: number) => req('POST', `/api/circle/${id}/mark-contacted`) as Promise<CirclePerson>,
  update: (id: number, patch: Partial<Pick<CirclePerson, 'name' | 'cadence_days'>>) =>
    req('PUT', `/api/circle/${id}`, patch) as Promise<CirclePerson>,
  remove: (id: number) => req('DELETE', `/api/circle/${id}`) as Promise<{ ok: true }>,
};

export type GoalHorizon = 'yearly' | 'monthly' | 'weekly';

// A goal's owner: one of the 6 real projects, or the reserved "life" key
// — panel 2 shows "LIFE PLAN" instead of a project name for it, but it's
// otherwise an ordinary owner of weekly/monthly/yearly goals through the
// same GoalsPanel component. See the backend's GoalOwnerKeyT (api/schemas.py)
// and database/models.py's Goal.project_key comment for why this is a
// separate type from ProjectKey rather than widening it — ProjectKey also
// types real Project rows, and "life" has none.
export type GoalOwnerKey = ProjectKey | 'life';

export interface Goal {
  id: number;
  project_key: GoalOwnerKey;
  horizon: GoalHorizon;
  text: string;
  done: boolean;
  start_date: string;
  done_date: string | null;
  note: string;
  // The goal's own single, immediately-executable next step — separate
  // from `note` (free-form) and from a BoardTask's own next_action
  // (scoped to one task's board). Added from Zahid's visual-hierarchy
  // review: knowing the goal isn't the same as knowing what to do next.
  next_action: string;
  // Stored, editable via a calendar picker — defaults to a horizon-based
  // window at creation (7 days / 30 days / 12 months; see the backend's
  // engine.goals._default_deadline and its own crossed-keys warning) but
  // is ordinary state after that, same as start_date. Supersedes the old
  // pure-display "start + a hardcoded 30-day window" computation.
  deadline: string;
  day_number: number;
  // Derived — how many of this goal's Individual Task Board cards
  // (across every task under it) sit in the "done" column, out of how
  // many exist. board_total is 0 for a goal that has never opened its
  // Board — read that as "no board data", not "0% done".
  board_done: number;
  board_total: number;
  // How many of those same cards sit in "focus" — tells GoalBoardOverlay's
  // "Actions" progress step apart from "Plans" (total > 0 alone can't:
  // a goal with everything still QUEUED has total > 0 but nothing
  // actually in focus).
  board_focus: number;
  // The title of this goal's own "top" FOCUS card across every task
  // under it (pinned first, then oldest), null when nothing is in
  // FOCUS anywhere on this goal's boards. Added 2026-09-16 so the
  // NEXT ACTION field can default to this instead of sitting empty.
  board_focus_title: string | null;
}

export interface GoalPanel {
  project_key: ProjectKey;
  sec_title_yearly: string | null;
  sec_title_monthly: string | null;
  sec_title_weekly: string | null;
}

export const goalsApi = {
  list: (key: GoalOwnerKey, horizon?: GoalHorizon) =>
    req('GET', `/api/projects/${key}/goals` + (horizon ? `?horizon=${horizon}` : '')) as Promise<Goal[]>,
  create: (
    key: GoalOwnerKey,
    horizon: GoalHorizon,
    text: string,
    startDate?: string,
    note = '',
    nextAction = '',
    deadline?: string,
  ) =>
    req('POST', `/api/projects/${key}/goals`, {
      horizon,
      text,
      start_date: startDate ?? null,
      note,
      next_action: nextAction,
      deadline: deadline ?? null,
    }) as Promise<Goal>,
  edit: (id: number, patch: Partial<Pick<Goal, 'text' | 'start_date' | 'note' | 'next_action' | 'deadline'>>) =>
    req('PUT', `/api/projects/goals/${id}`, patch) as Promise<Goal>,
  toggle: (id: number) => req('POST', `/api/projects/goals/${id}/toggle`) as Promise<Goal>,
  remove: (id: number) => req('DELETE', `/api/projects/goals/${id}`) as Promise<{ ok: true }>,
  getPanel: () => req('GET', '/api/goals/panel') as Promise<GoalPanel>,
  setPanelProject: (key: ProjectKey) =>
    req('POST', '/api/goals/panel/project', { project_key: key }) as Promise<GoalPanel>,
  setSectionTitle: (horizon: GoalHorizon, title: string) =>
    req('POST', '/api/goals/panel/section-title', { horizon, title }) as Promise<GoalPanel>,
};

// A goal's own flat task checklist — mirrors Subtask/projectsApi's
// subtask methods above, scoped to goal_id instead of project_key. Lets
// GoalsPanel add/check/remove tasks straight from the card, with no need
// to open the goal's Individual Task Board.
export interface GoalTask {
  pid: string;
  goal_id: number;
  text: string;
  done: boolean;
  added_date: string;
}

export const goalTasksApi = {
  list: (goalId: number) => req('GET', `/api/projects/goals/${goalId}/tasks`) as Promise<GoalTask[]>,
  add: (goalId: number, text: string) =>
    req('POST', `/api/projects/goals/${goalId}/tasks`, { text }) as Promise<GoalTask>,
  toggle: (pid: string) => req('POST', `/api/projects/goals/tasks/${pid}/toggle`) as Promise<GoalTask>,
  remove: (pid: string) => req('DELETE', `/api/projects/goals/tasks/${pid}`) as Promise<{ ok: true }>,
  strike: (pid: string) => req('POST', `/api/projects/goals/tasks/${pid}/strike`) as Promise<Task>,
};

// ── Planning hierarchy (Outcome -> Milestone -> Win -> PlanTask) ─────
// See the Phase A design spec: progress on every non-leaf node is
// always resolved server-side (never computed here) — `progress` on
// each of these types is already the derived-or-fixed value.
export interface Outcome {
  id: number;
  owner_key: GoalOwnerKey;
  title: string;
  year: number;
  status: string;
  fixed: boolean;
  progress: number;
  legacy_goal_id: number | null;
}

export interface Milestone {
  id: number;
  outcome_id: number;
  title: string;
  month: number;
  year: number;
  status: string;
  fixed: boolean;
  progress: number;
  legacy_goal_id: number | null;
}

export interface Win {
  id: number;
  milestone_id: number;
  title: string;
  week_start_date: string;
  criteria: string;
  status: string;
  fixed: boolean;
  progress: number;
  legacy_goal_id: number | null;
}

export interface PlanTask {
  id: number;
  win_id: number | null;
  title: string;
  scheduled_date: string | null;
  status: string;
  owner_key: GoalOwnerKey;
}

export interface ChecklistItem {
  pid: string;
  outcome_id: number | null;
  milestone_id: number | null;
  win_id: number | null;
  text: string;
  done: boolean;
  added_date: string;
}

export type CarryForwardActionKind = 'nextweek' | 'date' | 'backlog' | 'drop';

export const planningApi = {
  listOutcomes: (ownerKey: GoalOwnerKey) => req('GET', `/api/planning/${ownerKey}/outcomes`) as Promise<Outcome[]>,
  createOutcome: (ownerKey: GoalOwnerKey, title: string, year: number) =>
    req('POST', `/api/planning/${ownerKey}/outcomes`, { title, year }) as Promise<Outcome>,
  editOutcome: (id: number, patch: Partial<Pick<Outcome, 'title' | 'status'>>) =>
    req('PUT', `/api/planning/outcomes/${id}`, patch) as Promise<Outcome>,
  deleteOutcome: (id: number, force = false) =>
    req('DELETE', `/api/planning/outcomes/${id}${force ? '?force=true' : ''}`) as Promise<{ ok: true }>,

  listMilestones: (outcomeId: number) =>
    req('GET', `/api/planning/outcomes/${outcomeId}/milestones`) as Promise<Milestone[]>,
  createMilestone: (outcomeId: number, title: string, month: number, year: number) =>
    req('POST', '/api/planning/milestones', { outcome_id: outcomeId, title, month, year }) as Promise<Milestone>,
  editMilestone: (id: number, patch: Partial<Pick<Milestone, 'title' | 'status' | 'outcome_id'>>) =>
    req('PUT', `/api/planning/milestones/${id}`, patch) as Promise<Milestone>,
  deleteMilestone: (id: number, force = false) =>
    req('DELETE', `/api/planning/milestones/${id}${force ? '?force=true' : ''}`) as Promise<{ ok: true }>,

  listWins: (milestoneId: number) => req('GET', `/api/planning/milestones/${milestoneId}/wins`) as Promise<Win[]>,
  createWin: (milestoneId: number, title: string, weekStartDate: string, criteria = '') =>
    req('POST', '/api/planning/wins', { milestone_id: milestoneId, title, week_start_date: weekStartDate, criteria }) as Promise<Win>,
  editWin: (id: number, patch: Partial<Pick<Win, 'title' | 'criteria' | 'status' | 'milestone_id'>>) =>
    req('PUT', `/api/planning/wins/${id}`, patch) as Promise<Win>,
  deleteWin: (id: number, force = false) =>
    req('DELETE', `/api/planning/wins/${id}${force ? '?force=true' : ''}`) as Promise<{ ok: true }>,

  listTasksForWin: (winId: number) => req('GET', `/api/planning/wins/${winId}/tasks`) as Promise<PlanTask[]>,
  listTasksByDate: (ownerKey: GoalOwnerKey, date: string) =>
    req('GET', `/api/planning/${ownerKey}/tasks/by-date?date=${date}`) as Promise<PlanTask[]>,
  createTask: (ownerKey: GoalOwnerKey, title: string, winId?: number, scheduledDate?: string) =>
    req('POST', `/api/planning/${ownerKey}/tasks`, { title, win_id: winId ?? null, scheduled_date: scheduledDate ?? null }) as Promise<PlanTask>,
  editTask: (id: number, patch: Partial<Pick<PlanTask, 'title' | 'status'>>) =>
    req('PUT', `/api/planning/tasks/${id}`, patch) as Promise<PlanTask>,
  scheduleTask: (id: number, scheduledDate: string | null, winId: number | null) =>
    req('PUT', `/api/planning/tasks/${id}/schedule`, { scheduled_date: scheduledDate, win_id: winId }) as Promise<PlanTask>,
  carryForwardTask: (id: number, action: CarryForwardActionKind) =>
    req('POST', `/api/planning/tasks/${id}/carry-forward`, { action }) as Promise<PlanTask>,
  removeTask: (id: number) => req('DELETE', `/api/planning/tasks/${id}`) as Promise<{ ok: true }>,

  listChecklistItems: (scope: { outcomeId?: number; milestoneId?: number; winId?: number }) => {
    const q = new URLSearchParams();
    if (scope.outcomeId) q.set('outcome_id', String(scope.outcomeId));
    if (scope.milestoneId) q.set('milestone_id', String(scope.milestoneId));
    if (scope.winId) q.set('win_id', String(scope.winId));
    return req('GET', `/api/planning/checklist-items?${q}`) as Promise<ChecklistItem[]>;
  },
  addChecklistItem: (text: string, scope: { outcomeId?: number; milestoneId?: number; winId?: number }) =>
    req('POST', '/api/planning/checklist-items', {
      text,
      outcome_id: scope.outcomeId ?? null,
      milestone_id: scope.milestoneId ?? null,
      win_id: scope.winId ?? null,
    }) as Promise<ChecklistItem>,
  toggleChecklistItem: (pid: string) => req('POST', `/api/planning/checklist-items/${pid}/toggle`) as Promise<ChecklistItem>,
  removeChecklistItem: (pid: string) => req('DELETE', `/api/planning/checklist-items/${pid}`) as Promise<{ ok: true }>,
};

// One entry per fetchable goal/planning owner — the 6 real (`is_named`)
// projects plus the "life" virtual owner. Moved here from
// GoalHorizonSection.tsx (superseded by the Planning*Level components)
// since it's shared by all three of those plus Panel3's own
// HoursAccordion — this is its natural home now that it outlives that
// file. `color` is that project's own `accent_color` — null for "life",
// which has never had one.
export interface GoalOwnerMeta {
  key: GoalOwnerKey;
  label: string;
  color: string | null;
}

// ── Individual Task Board (Goal -> Task -> that Task's own kanban) ───
// Superseded design note: this used to be a flat per-project board
// (project_key-scoped BoardCard with an optional goal_id backlink).
// The user corrected the shape to a 3-level hierarchy — Goal -> Task
// (1..N) -> that Task's own QUEUED/FOCUS/CLOSED board — so a new
// BoardTask tier sits between Goal and BoardCard, and cards are now
// scoped to a task, not a project.
//
// Same Card contract as the `ele kanban` Electron pilot this was
// originally ported from (id/col/title/note/priority/pinned).
export type BoardCol = 'todo' | 'focus' | 'done';
export type BoardPriority = 'low' | 'normal' | 'high';

export interface BoardTask {
  id: number;
  goal_id: number;
  title: string;
  // "Task outcome / Definition of Done" — added after Zahid compared
  // this overlay to the `ele kanban` pilot's own Focus Board header
  // (which opened with a milestone-ladder/units-sold/target-date
  // block). That header's own widgets are that pilot's venture-
  // tracking clutter, not reused here — but the idea of orienting the
  // board under one line before showing columns was worth keeping,
  // scoped to what finishes THIS task rather than a whole venture.
  outcome: string;
  // The task-scoped twin of Goal.next_action — "what finishes the
  // current card/session on THIS task's board", not the goal's own
  // next step. See Goal.next_action's comment for why there are two.
  next_action: string;
}

export interface BoardCard {
  id: number;
  task_id: number;
  col: BoardCol;
  title: string;
  note: string;
  priority: BoardPriority;
  pinned: boolean;
  // Real start/stop timer (2026-09-16, Zahid) — same Session shape and
  // same "sessions[-1].end === null means running" convention as
  // Task.secs/sessions (see NowCard.tsx's own isRunning), reused rather
  // than a separate shape.
  secs: number;
  sessions: Session[];
}

export const boardTaskApi = {
  list: (goalId: number) => req('GET', `/api/projects/goals/${goalId}/tasks`) as Promise<BoardTask[]>,
  add: (goalId: number, title: string) =>
    req('POST', `/api/projects/goals/${goalId}/tasks`, { title }) as Promise<BoardTask>,
  edit: (id: number, patch: Partial<Pick<BoardTask, 'title' | 'outcome' | 'next_action'>>) =>
    req('PUT', `/api/projects/board-tasks/${id}`, patch) as Promise<BoardTask>,
  remove: (id: number) => req('DELETE', `/api/projects/board-tasks/${id}`) as Promise<{ ok: true }>,
};

export const boardApi = {
  list: (taskId: number) => req('GET', `/api/projects/board-tasks/${taskId}/cards`) as Promise<BoardCard[]>,
  add: (taskId: number, col: BoardCol, title: string, note = '', priority: BoardPriority = 'normal') =>
    req('POST', `/api/projects/board-tasks/${taskId}/cards`, { col, title, note, priority }) as Promise<BoardCard>,
  edit: (id: number, patch: Partial<Pick<BoardCard, 'title' | 'note' | 'priority'>>) =>
    req('PUT', `/api/projects/board-cards/${id}`, patch) as Promise<BoardCard>,
  move: (id: number, col: BoardCol) =>
    req('POST', `/api/projects/board-cards/${id}/move`, { col }) as Promise<BoardCard>,
  togglePin: (id: number) => req('POST', `/api/projects/board-cards/${id}/toggle-pin`) as Promise<BoardCard>,
  toggleTimer: (id: number) => req('POST', `/api/projects/board-cards/${id}/toggle-timer`) as Promise<BoardCard>,
  remove: (id: number) => req('DELETE', `/api/projects/board-cards/${id}`) as Promise<{ ok: true }>,
};

export type LogStatus = '' | 'ok' | 'no';
export type JourneyEvent = 'launched' | 'advanced' | null;

export interface JourneyTask {
  id: number;
  stage_index: number;
  text: string;
  done: boolean;
}

export interface JourneyLogEntry {
  id: number;
  stage_index: number;
  text: string;
  date: string;
  status: LogStatus;
}

export interface JourneyStage {
  stage_index: number;
  name: string;
  description: string;
  gate: string;
  gate_done: boolean;
  done: boolean;
  tasks: JourneyTask[];
  logs: JourneyLogEntry[];
}

export interface JourneyPin {
  kind: 'word' | 'image';
  value: string;
}

export interface Journey {
  project_key: ProjectKey;
  proj_name: string;
  tagline: string;
  cover_image: string;
  attach_file: string;
  why: string;
  vision: string;
  vision_note: string;
  target_date: string; // YYYY-MM-DD or ''
  pins: JourneyPin[];
  last_move: string; // YYYY-MM-DD or ''
  current_stage: number;
  launched: boolean;
  event: JourneyEvent;
  stages: JourneyStage[];
}

export const journeyApi = {
  get: (key: ProjectKey) => req('GET', `/api/projects/${key}/journey`) as Promise<Journey>,
  updateMeta: (key: ProjectKey, patch: Partial<
      Pick<Journey, 'proj_name' | 'tagline' | 'cover_image' | 'attach_file' | 'why' | 'vision' | 'vision_note' | 'target_date' | 'pins'>
    >) =>
    req('PUT', `/api/projects/${key}/journey`, patch) as Promise<Journey>,
  updateStageMeta: (key: ProjectKey, stageIndex: number, patch: Partial<Pick<JourneyStage, 'name' | 'description'>>) =>
    req('PUT', `/api/projects/${key}/journey/stages/${stageIndex}`, patch) as Promise<Journey>,
  setGate: (key: ProjectKey, stageIndex: number, gate: string) =>
    req('PUT', `/api/projects/${key}/journey/stages/${stageIndex}/gate`, { gate }) as Promise<Journey>,
  toggleGate: (key: ProjectKey, stageIndex: number) =>
    req('POST', `/api/projects/${key}/journey/stages/${stageIndex}/gate/toggle`) as Promise<Journey>,
  addTask: (key: ProjectKey, stageIndex: number, text: string) =>
    req('POST', `/api/projects/${key}/journey/stages/${stageIndex}/tasks`, { text }) as Promise<Journey>,
  addLog: (key: ProjectKey, stageIndex: number, text: string) =>
    req('POST', `/api/projects/${key}/journey/stages/${stageIndex}/logs`, { text }) as Promise<Journey>,
  editTask: (taskId: number, text: string) => req('PUT', `/api/journey/tasks/${taskId}`, { text }) as Promise<Journey>,
  toggleTask: (taskId: number) => req('POST', `/api/journey/tasks/${taskId}/toggle`) as Promise<Journey>,
  deleteTask: (taskId: number) => req('DELETE', `/api/journey/tasks/${taskId}`) as Promise<Journey>,
  cycleLog: (entryId: number) => req('POST', `/api/journey/logs/${entryId}/cycle`) as Promise<Journey>,
  deleteLog: (entryId: number) => req('DELETE', `/api/journey/logs/${entryId}`) as Promise<Journey>,
  pickCoverImage: () => window.api.pickImage(),
  readCoverImage: (filePath: string) => window.api.readImage(filePath),
  pickAttachFile: () => window.api.pickFile(),
  openAttachFile: (filePath: string) => window.api.openPath(filePath),
};

export type Lang = 'en' | 'bn';

export interface Settings {
  theme: Theme;
  onboarded: boolean;
  lang: Lang;
  analog_clock: boolean;
  plan_adaptive: boolean;
  auto_timer_on_open: boolean;
  idle_stop_min: number;
  phase_morning_start: number;
  phase_work_start: number;
  phase_evening_start: number;
  phase_sleep_start: number;
  goal_hours: number;
  currency: string;
  start_with_windows: boolean;
  panel_layout: PanelLayout;
  focus_tab: FocusTab;
}

export type SettingsPatch = Partial<
  Pick<
    Settings,
    | 'lang'
    | 'analog_clock'
    | 'plan_adaptive'
    | 'auto_timer_on_open'
    | 'idle_stop_min'
    | 'phase_morning_start'
    | 'phase_work_start'
    | 'phase_evening_start'
    | 'phase_sleep_start'
    | 'goal_hours'
    | 'currency'
    | 'start_with_windows'
    | 'panel_layout'
    | 'focus_tab'
  >
>;

export const settingsApi = {
  get: () => req('GET', '/api/settings') as Promise<Settings>,
  setTheme: (theme: Theme) => req('POST', '/api/settings/theme', { theme }) as Promise<Settings>,
  setOnboarded: () => req('POST', '/api/settings/onboarded') as Promise<Settings>,
  update: (patch: SettingsPatch) => req('PUT', '/api/settings', patch) as Promise<Settings>,
};

export type BdpStatus = 'IDEA' | 'OPPORTUNITY' | 'RESEARCH' | 'PLAN' | 'ACTIVE' | 'HOLD' | 'DONE';
export type BdpPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type BdpSort = 'manual' | 'priority';
export type BdpView = 'card' | 'table' | 'list';

export interface BdpAction {
  id: number;
  text: string;
  done: boolean;
}

export interface BdpPlan {
  id: number;
  title: string;
  status: BdpStatus;
  priority: BdpPriority;
  opportunity: string;
  market: string;
  target: string;
  niche: string;
  model: string;
  product: string;
  service: string;
  supplier: string;
  timeline: string;
  potential: number;
  difficulty: number;
  cost_amount: string;
  yearly_profit: string;
  notes: string;
  archived: boolean;
  created: string;
  updated: string;
  order: number;
  next_actions: BdpAction[];
}

export type BdpPlanPatch = Partial<
  Pick<
    BdpPlan,
    | 'title'
    | 'status'
    | 'priority'
    | 'opportunity'
    | 'market'
    | 'target'
    | 'niche'
    | 'model'
    | 'product'
    | 'service'
    | 'supplier'
    | 'timeline'
    | 'potential'
    | 'difficulty'
    | 'cost_amount'
    | 'yearly_profit'
    | 'notes'
  >
>;

export interface BdpListFilters {
  status?: BdpStatus | 'All';
  priority?: BdpPriority | 'All';
  market?: string;
  q?: string;
  sort?: BdpSort;
}

export const bdpApi = {
  list: (filters: BdpListFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'All') params.set('status', filters.status);
    if (filters.priority && filters.priority !== 'All') params.set('priority', filters.priority);
    if (filters.market && filters.market !== 'All') params.set('market', filters.market);
    if (filters.q) params.set('q', filters.q);
    if (filters.sort) params.set('sort', filters.sort);
    const qs = params.toString();
    return req('GET', `/api/bdp/plans${qs ? `?${qs}` : ''}`) as Promise<BdpPlan[]>;
  },
  create: (title: string, patch: BdpPlanPatch = {}) =>
    req('POST', '/api/bdp/plans', { title, ...patch }) as Promise<BdpPlan>,
  edit: (id: number, patch: BdpPlanPatch) => req('PUT', `/api/bdp/plans/${id}`, patch) as Promise<BdpPlan>,
  duplicate: (id: number) => req('POST', `/api/bdp/plans/${id}/duplicate`) as Promise<BdpPlan>,
  archive: (id: number) => req('POST', `/api/bdp/plans/${id}/archive`) as Promise<BdpPlan>,
  remove: (id: number) => req('DELETE', `/api/bdp/plans/${id}`) as Promise<{ ok: boolean }>,
  move: (id: number, direction: -1 | 1) =>
    req('POST', `/api/bdp/plans/${id}/move`, { direction }) as Promise<BdpPlan[]>,
  getSort: () => req('GET', '/api/bdp/sort') as Promise<{ sort: BdpSort }>,
  setSort: (sort: BdpSort) => req('POST', '/api/bdp/sort', { sort }) as Promise<{ sort: BdpSort }>,
  reorder: (id: number, toIndex: number) =>
    req('POST', `/api/bdp/plans/${id}/reorder`, { to_index: toIndex }) as Promise<BdpPlan[]>,
  getView: () => req('GET', '/api/bdp/view') as Promise<{ view: BdpView }>,
  setView: (view: BdpView) => req('POST', '/api/bdp/view', { view }) as Promise<{ view: BdpView }>,
  addAction: (planId: number, text: string) =>
    req('POST', `/api/bdp/plans/${planId}/actions`, { text }) as Promise<BdpPlan>,
  editAction: (actionId: number, text: string) =>
    req('PUT', `/api/bdp/actions/${actionId}`, { text }) as Promise<BdpPlan>,
  toggleAction: (actionId: number) => req('POST', `/api/bdp/actions/${actionId}/toggle`) as Promise<BdpPlan>,
  deleteAction: (actionId: number) => req('DELETE', `/api/bdp/actions/${actionId}`) as Promise<BdpPlan>,
};

export type Q90AreaKey = 'appearance' | 'money' | 'relationship' | 'health' | 'social' | 'mind';
// V2 "112-Day Transformation Board" — the 7 free-text fields settable
// through quarterlyApi.setField. `achieved`, major changes and
// destination changes each have their own dedicated call below.
export type Q90Field =
  | 'current_reality'
  | 'destination'
  | 'proof'
  | 'gap'
  | 'weekly_lead_behavior'
  | 'obstacle_if'
  | 'response_then';
export type Q90Status = 'not_started' | 'defined' | 'planned' | 'active' | 'proven';
export type Q90MetaField = 'label' | 'description';

export interface Q90MajorChange {
  id: number;
  text: string;
  done: boolean;
}

export interface Q90GoalHistoryEntry {
  destination: string;
  reason: string;
  evidence: string;
  changed_at: string;
}

export interface Q90Area {
  key: Q90AreaKey;
  label: string;
  glyph: string;
  description: string;
  current_reality: string;
  destination: string;
  proof: string;
  achieved: boolean;
  gap: string;
  major_changes: Q90MajorChange[];
  weekly_lead_behavior: string;
  obstacle_if: string;
  response_then: string;
  goal_version: number;
  goal_history: Q90GoalHistoryEntry[];
  status: Q90Status;
}

export interface Q90Panel {
  cycle_start: string;
  cycle_end: string;
  cycle_days: number;
  day: number;
  days_left: number;
  areas_done: number;
  areas_total: number;
  areas: Q90Area[];
}

export const quarterlyApi = {
  getPanel: () => req('GET', '/api/quarterly/panel') as Promise<Q90Panel>,
  setField: (area: Q90AreaKey, field: Q90Field, text: string) =>
    req('POST', '/api/quarterly/field', { area, field, text }) as Promise<Q90Panel>,
  setAreaMeta: (area: Q90AreaKey, field: Q90MetaField, text: string) =>
    req('POST', '/api/quarterly/area-meta', { area, field, text }) as Promise<Q90Panel>,
  setAchieved: (area: Q90AreaKey, achieved: boolean) =>
    req('POST', '/api/quarterly/achieved', { area, achieved }) as Promise<Q90Panel>,
  setMajorChanges: (area: Q90AreaKey, changes: Array<{ id?: number; text: string; done?: boolean }>) =>
    req('POST', '/api/quarterly/major-changes', { area, changes }) as Promise<Q90Panel>,
  changeGoal: (area: Q90AreaKey, newDestination: string, reason: string, evidence: string) =>
    req('POST', '/api/quarterly/change-goal', {
      area,
      new_destination: newDestination,
      reason,
      evidence,
    }) as Promise<Q90Panel>,
  changeStrategy: (area: Q90AreaKey) =>
    req('POST', '/api/quarterly/change-strategy', { area }) as Promise<Q90Panel>,
  setCycle: (start: string, days: number) =>
    req('POST', '/api/quarterly/cycle', { start, days }) as Promise<Q90Panel>,
  reorderAreas: (order: Q90AreaKey[]) =>
    req('POST', '/api/quarterly/reorder-areas', { order }) as Promise<Q90Panel>,
};

// ── Daily Do's / Don'ts ──────────────────────────────────────────────
// Standing daily commitments shown in Morning Ritual — see
// database/models.py's HabitItem docstring (Python) for the storage
// shape and engine/habits.py for streak computation.
export type HabitKind = 'do' | 'dont';
export type HabitPriority = 'low' | 'normal' | 'high';

export interface HabitItem {
  id: number;
  kind: HabitKind;
  name: string;
  time: string;
  priority: HabitPriority;
  tracking_basis: string;
  sort_order: number;
  done_today: boolean;
  streak: number;
}

export const habitsApi = {
  list: () => req('GET', '/api/habits') as Promise<HabitItem[]>,
  create: (kind: HabitKind, name: string, time = '', priority: HabitPriority = 'normal', trackingBasis = '') =>
    req('POST', '/api/habits', { kind, name, time, priority, tracking_basis: trackingBasis }) as Promise<HabitItem[]>,
  edit: (
    id: number,
    patch: Partial<{ name: string; time: string; priority: HabitPriority; tracking_basis: string }>
  ) => req('PUT', `/api/habits/${id}`, patch) as Promise<HabitItem[]>,
  checkin: (id: number, date: string, done: boolean) =>
    req('POST', `/api/habits/${id}/checkin`, { date, done }) as Promise<HabitItem[]>,
  remove: (id: number) => req('DELETE', `/api/habits/${id}`) as Promise<HabitItem[]>,
  reorder: (ids: number[]) => req('POST', '/api/habits/reorder', { ids }) as Promise<HabitItem[]>,
};

export const exportApi = {
  backup: () => req('GET', '/api/export/backup') as Promise<{ filename: string; data: unknown }>,
  csv: () => req('GET', '/api/export/csv') as Promise<{ filename: string; csv: string }>,
  // Fetches both payloads, then hands them to the main-process folder
  // picker in one call — matches the legacy app's single "Export Data"
  // action producing both files in one chosen folder.
  exportAll: async (): Promise<ExportSaveResult> => {
    const [backup, csv] = await Promise.all([exportApi.backup(), exportApi.csv()]);
    return window.api.exportSave([
      { filename: backup.filename, content: JSON.stringify(backup.data, null, 2) },
      { filename: csv.filename, content: csv.csv },
    ]);
  },
};

export interface HourSlot {
  // Null for an hour nothing was ever written in.
  id: number | null;
  hour: number;
  text: string;
  done: boolean;
  // Carries forward to tomorrow if it is still unfinished.
  repeat: boolean;
}

export interface HourBlock {
  key: string;
  name: string;
  hours: HourSlot[];
  done: number;
  planned: number;
}

export interface HourPlan {
  day: string;
  current_block: string;
  total_done: number;
  total_planned: number;
  blocks: HourBlock[];
}

export const hoursApi = {
  get: (day: string) => req('GET', `/api/hours/${day}`) as Promise<HourPlan>,
  set: (day: string, hour: number, patch: { text?: string; done?: boolean; repeat?: boolean }) =>
    req('PUT', `/api/hours/${day}/${hour}`, patch) as Promise<HourSlot>,
};

// ── Morning Ritual ──────────────────────────────────────────────────
// Rebuilt 2026-09-15 to match Zahid's fuller "Morning Activation"
// brainstorm prototype — see python/database/models.py's MorningRitual
// docstring for the full scoping history. One continuous page, not a
// step wizard. carried_from_date is now real — see Night Closure below,
// which populates it server-side; the real AI suggestion is still
// deliberately deferred.
export type MorningEnergy = 'LOW' | 'OKAY' | 'GOOD' | 'STRONG';
export type MorningMood = 'LOW' | 'NEUTRAL' | 'GOOD' | 'POSITIVE';
export type MorningSleep = 'POOR' | 'OKAY' | 'GOOD';
export type MorningMode = 'gentle' | 'standard' | 'fast';
export type MorningIntention = 'Focus' | 'Patience' | 'Discipline' | 'Calm';
export type MorningSpiritual = 'OFF' | 'Prayer' | 'Dhikr' | 'Quran' | 'Meditation' | 'Personal Reflection' | 'Custom';

export interface MorningRitual {
  day: string;
  today_outcome: string;
  first_move: string;
  carried_from_date: string | null;
  energy: MorningEnergy | null;
  mood: MorningMood | null;
  sleep_quality: MorningSleep | null;
  wake_up_time: string | null;
  morning_mode: MorningMode;
  reset_breathe: boolean;
  reset_move: boolean;
  reset_daylight: boolean;
  reset_water: boolean;
  journal_text: string;
  journal_action_needed: boolean | null;
  journal_released: boolean;
  prime_meditation: boolean;
  prime_visualization: boolean;
  prime_reading: boolean;
  prime_gratitude: string;
  prime_intention: MorningIntention | null;
  prime_spiritual: MorningSpiritual;
  completed: boolean;
  started_at: number | null;
  started_first_action_at: number | null;
  completed_at: number | null;
  kpi_seconds: number | null;
}

export interface MorningRitualTrend {
  year: number;
  month: number;
  days: string[];
  completed: boolean[];
  energy: (MorningEnergy | null)[];
  mood: (MorningMood | null)[];
  sleep_quality: (MorningSleep | null)[];
  morning_mode: (MorningMode | null)[];
  streak: number;
  journal: MindsetEntry[];
  wake_up_time: MindsetEntry[];
}

export const morningRitualApi = {
  today: () => req('GET', '/api/morning-ritual/today') as Promise<MorningRitual>,
  setOutcome: (text: string) => req('POST', '/api/morning-ritual/outcome', { text }) as Promise<MorningRitual>,
  setFirstMove: (text: string) => req('POST', '/api/morning-ritual/first-move', { text }) as Promise<MorningRitual>,
  setCheckIn: (energy?: MorningEnergy, mood?: MorningMood, sleep_quality?: MorningSleep, wake_up_time?: string) =>
    req('POST', '/api/morning-ritual/check-in', { energy, mood, sleep_quality, wake_up_time }) as Promise<MorningRitual>,
  markBreatheDone: () => req('POST', '/api/morning-ritual/reset/breathe') as Promise<MorningRitual>,
  setResetMove: (done: boolean) => req('POST', '/api/morning-ritual/reset/move', { done }) as Promise<MorningRitual>,
  setResetDaylight: (done: boolean) => req('POST', '/api/morning-ritual/reset/daylight', { done }) as Promise<MorningRitual>,
  setResetWater: (done: boolean) => req('POST', '/api/morning-ritual/reset/water', { done }) as Promise<MorningRitual>,
  setJournal: (text: string) => req('POST', '/api/morning-ritual/journal', { text }) as Promise<MorningRitual>,
  setJournalActionNeeded: (needed: boolean) =>
    req('POST', '/api/morning-ritual/journal/action-needed', { needed }) as Promise<MorningRitual>,
  suggestAction: (text: string) =>
    req('POST', '/api/morning-ritual/suggest-action', { text }) as Promise<{ suggestion: string }>,
  markPrimeMeditation: () => req('POST', '/api/morning-ritual/prime/meditation') as Promise<MorningRitual>,
  markPrimeVisualization: () => req('POST', '/api/morning-ritual/prime/visualization') as Promise<MorningRitual>,
  markPrimeReading: () => req('POST', '/api/morning-ritual/prime/reading') as Promise<MorningRitual>,
  setPrimeGratitude: (text: string) => req('POST', '/api/morning-ritual/prime/gratitude', { text }) as Promise<MorningRitual>,
  setPrimeIntention: (value: MorningIntention | null) =>
    req('POST', '/api/morning-ritual/prime/intention', { value }) as Promise<MorningRitual>,
  setPrimeSpiritual: (value: MorningSpiritual) =>
    req('POST', '/api/morning-ritual/prime/spiritual', { value }) as Promise<MorningRitual>,
  startNow: () => req('POST', '/api/morning-ritual/start-now') as Promise<MorningRitual>,
  trend: (year?: number, month?: number) => {
    const params = year && month ? `?year=${year}&month=${month}` : '';
    return req('GET', `/api/morning-ritual/trend${params}`) as Promise<MorningRitualTrend>;
  },
};

// ── Night Closure ───────────────────────────────────────────────────
// Evening counterpart to Morning Ritual above — converted from Zahid's
// own HTML/JS mockup (night-closure.html, localStorage key
// `lifeos_night_closure`) to real per-day persistence. Its
// tomorrow_outcome/tomorrow_first_action are what the backend reads
// back as Morning Ritual's carried_from_date the next day — see
// python/engine/morning_ritual.py's _apply_carry_forward.
export interface NightClosure {
  day: string;
  where_stopped: string;
  unfinished: string;
  tomorrow_outcome: string;
  tomorrow_first_action: string;
  optional_blocker: string;
  optional_note: string;
  close_time: string | null;
  closed_at: number | null;
}

// One night of Night Closure's week view — see engine/night_closure.py
// recent(). `written` counts the four top fields holding text.
export interface NightClosureNight {
  day: string;
  closed: boolean;
  written: number;
}

export const nightClosureApi = {
  today: () => req('GET', '/api/night-closure/today') as Promise<NightClosure>,
  // Oldest first, ending tonight. Read-only on the server.
  recent: (days = 7) => req('GET', `/api/night-closure/recent?days=${days}`) as Promise<NightClosureNight[]>,
  setWhereStopped: (text: string) => req('POST', '/api/night-closure/where-stopped', { text }) as Promise<NightClosure>,
  setUnfinished: (text: string) => req('POST', '/api/night-closure/unfinished', { text }) as Promise<NightClosure>,
  setTomorrowOutcome: (text: string) =>
    req('POST', '/api/night-closure/tomorrow-outcome', { text }) as Promise<NightClosure>,
  setTomorrowFirstAction: (text: string) =>
    req('POST', '/api/night-closure/tomorrow-first-action', { text }) as Promise<NightClosure>,
  setBlocker: (text: string) => req('POST', '/api/night-closure/blocker', { text }) as Promise<NightClosure>,
  setNote: (text: string) => req('POST', '/api/night-closure/note', { text }) as Promise<NightClosure>,
  setCloseTime: (value: string) => req('POST', '/api/night-closure/close-time', { value }) as Promise<NightClosure>,
  closeDay: () => req('POST', '/api/night-closure/close') as Promise<NightClosure>,
};

// Global quick-capture notes — EXECUTE's own NOTES tab. `title` is
// derived server-side from the body's own first line, not a separate
// field to keep in sync (see the backend Note model's own docstring).
export interface Note {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  created_at: number;
  updated_at: number;
}

export const notesApi = {
  list: () => req('GET', '/api/notes') as Promise<Note[]>,
  create: (body = '') => req('POST', '/api/notes', { body }) as Promise<Note>,
  edit: (id: number, patch: Partial<Pick<Note, 'body' | 'pinned'>>) =>
    req('PUT', `/api/notes/${id}`, patch) as Promise<Note>,
  remove: (id: number) => req('DELETE', `/api/notes/${id}`) as Promise<{ ok: true }>,
  restore: (id: number) => req('POST', `/api/notes/${id}/restore`) as Promise<Note>,
};

// ── Health (engine/health.py) ────────────────────────────────────────
export type HealthGoal = 'lose' | 'maintain' | 'gain';
export type HealthActivity = 'low' | 'moderate' | 'high';
export interface HealthProfile {
  age: number;
  sex: 'male' | 'female';
  height_cm: number;
  weight_kg: number;
  goal: HealthGoal;
  activity: HealthActivity;
  place: 'home' | 'gym';
  start_date: string;
  weeks: number;
  diet?: string[];
  dislikes?: string[];
}
export type HealthScope = 'day' | 'weekday' | 'all';
export interface HealthMealPart {
  food: string;
  qty: number;
  portion: string;
  kcal: number;
  protein_g: number;
  known: boolean;
}
export interface HealthMeal {
  slot: number;
  name: string;
  time: string;
  items: string;
  kcal: number;
  protein_g: number;
  parts: HealthMealPart[];
  edited: HealthScope | null;
}
export interface HealthBlock {
  name: string;
  minutes: number;
  moves: [string, string, string][]; // name, dose, equipment
  edited: HealthScope | null;
}
export interface HealthFood {
  name: string;
  portion: string;
  kcal: number;
  protein_g: number;
  group: string;
  allowed: boolean;
  disliked: boolean;
}
export interface HealthExercise {
  name: string;
  category: string;
  equipment: string;
  level: number;
  dose: string;
}
export interface HealthDayPlan {
  day: string;
  plan_day: number;
  week: number;
  week_name: string;
  in_plan: boolean;
  workout: { kind: string; name: string; minutes: number; blocks: HealthBlock[] };
  meals: HealthMeal[];
}
export interface HealthCell {
  day: string;
  meals: number;
  workout_done: boolean;
  rest: boolean;
  moves_done: number;
  moves_total: number;
  on_plan: boolean;
  water: number;
  future: boolean;
}
export interface HealthState {
  profile: HealthProfile | null;
  targets?: { kcal: number; protein_g: number; water_glasses: number };
  today?: string;
  day?: HealthDayPlan;
  log?: { meals: number[]; moves: string[]; water: number };
  week?: HealthCell[];
  month?: HealthCell[];
  month_on_plan?: number;
  month_elapsed?: number;
  streak?: number;
}
export interface HealthWeekPct {
  week: number;
  days: number;
  meals_pct: number;
  workouts_pct: number | null;
}
export interface HealthMeasure {
  day: string;
  weight_kg: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
}
export interface HealthProgress {
  today: string;
  start_date: string;
  end_date: string;
  plan_day: number;
  plan_days: number;
  elapsed: number;
  on_plan: number;
  workouts_planned: number;
  workouts_done: number;
  avg_kcal: number | null;
  kcal_target: number;
  meals_pct: number | null;
  weeks: HealthWeekPct[];
  slip: { weekday: number; missed: number; of: number } | null;
  weights: HealthMeasure[];
  weight_change: number | null;
  goal_weight_kg: number | null;
  profile_weight_kg: number;
  waist_cm: number | null;
  hip_cm: number | null;
}
export interface HealthShopItem {
  name: string;
  qty: string;
  custom: boolean;
  bought: boolean;
}
export interface HealthShopping {
  week: string;
  end: string;
  plan_week: number;
  groups: { group: string; items: HealthShopItem[] }[];
  bought: number;
  total: number;
}
export type HealthProfileInput = Omit<HealthProfile, 'start_date' | 'weeks'> & { start_date?: string };

export const healthApi = {
  state: (day?: string) => req('GET', `/api/health/state${day ? `?day=${day}` : ''}`) as Promise<HealthState>,
  setProfile: (p: HealthProfileInput) => req('PUT', '/api/health/profile', p) as Promise<HealthState>,
  restart: (start_date?: string) => req('POST', '/api/health/restart', { start_date }) as Promise<HealthState>,
  setMeal: (day: string, slot: number, done: boolean) => req('POST', '/api/health/meal', { day, slot, done }) as Promise<HealthState>,
  setMove: (day: string, key: string, done: boolean) => req('POST', '/api/health/move', { day, key, done }) as Promise<HealthState>,
  addWater: (day: string, delta: number) => req('POST', '/api/health/water', { day, delta }) as Promise<HealthState>,
  setMealItems: (day: string, slot: number, items: { food: string; qty: number }[], scope: HealthScope) =>
    req('PUT', '/api/health/meal-items', { day, slot, items, scope }) as Promise<HealthState>,
  setBlockMoves: (day: string, block: number, moves: { name: string; dose: string }[], scope: HealthScope) =>
    req('PUT', '/api/health/block-moves', { day, block, moves, scope }) as Promise<HealthState>,
  reset: (day: string, scope: HealthScope) => req('POST', '/api/health/reset', { day, scope }) as Promise<HealthState>,
  setDiet: (diet: string[]) => req('PUT', '/api/health/diet', { diet }) as Promise<HealthState>,
  setDislike: (food: string, dislike: boolean) => req('POST', '/api/health/dislike', { food, dislike }) as Promise<HealthState>,
  library: () => req('GET', '/api/health/library') as Promise<{ foods: HealthFood[]; exercises: HealthExercise[] }>,
  swaps: (food: string) =>
    req('GET', `/api/health/swaps?food=${encodeURIComponent(food)}`) as Promise<{ name: string; portion: string; kcal: number; protein_g: number }[]>,
  progress: () => req('GET', '/api/health/progress') as Promise<HealthProgress>,
  logMeasure: (m: { day?: string; weight_kg?: number; waist_cm?: number; hip_cm?: number }) =>
    req('POST', '/api/health/measure', m) as Promise<HealthProgress>,
  setGoalWeight: (kg: number | null) => req('PUT', '/api/health/goal-weight', { kg }) as Promise<HealthProgress>,
  shopping: (day?: string) => req('GET', `/api/health/shopping${day ? `?day=${day}` : ''}`) as Promise<HealthShopping>,
  setBought: (week: string, name: string, bought: boolean) =>
    req('POST', '/api/health/shopping/bought', { week, name, bought }) as Promise<HealthShopping>,
  addShopItem: (week: string, name: string, qty: string) =>
    req('POST', '/api/health/shopping/add', { week, name, qty }) as Promise<HealthShopping>,
  removeShopItem: (week: string, name: string) =>
    req('POST', '/api/health/shopping/remove', { week, name }) as Promise<HealthShopping>,
};

import type { Theme } from '../themes';

export type ListKey = 'classic' | 'focus';
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

declare global {
  interface Window {
    api: {
      healthCheck: () => Promise<{ status: string }>;
      request: (method: string, path: string, body?: unknown) => Promise<unknown>;
      exportSave: (files: ExportFile[]) => Promise<ExportSaveResult>;
    };
  }
}

const req = window.api.request;

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
  toggleStrike: (id: number, projectKey?: string) =>
    req('POST', `/api/tasks/${id}/toggle-strike`, projectKey ? { project_key: projectKey } : undefined) as Promise<Task>,
  restore: (task: Task) => req('POST', '/api/tasks/restore', task) as Promise<Task>,
  listStrike: () => req('GET', '/api/tasks/strike') as Promise<Task[]>,
  getDayView: () => req('GET', '/api/tasks/day-view') as Promise<{ view: DayView }>,
  setDayView: (view: DayView) => req('POST', '/api/tasks/day-view', { view }) as Promise<{ view: DayView }>,
};

export const STRIKE_MAX = 3;

export type HabitCategory = 'money' | 'health' | 'relation' | 'mind';

export interface Habit {
  id: number;
  category: HabitCategory;
  name: string;
  sort_order: number;
  active: boolean;
  done: boolean;
}

export interface CategorySummary {
  done: number;
  total: number;
  pct: number;
}

export interface DaySummary {
  day: string;
  score: number;
  categories: Record<HabitCategory, CategorySummary>;
}

export interface WeekScore {
  day: string;
  label: string;
  pct: number;
}

export const habitsApi = {
  list: (day: string, category?: HabitCategory) =>
    req(
      'GET',
      `/api/habits?day=${day}` + (category ? `&category=${category}` : ''),
    ) as Promise<Habit[]>,
  create: (category: HabitCategory, name: string) =>
    req('POST', '/api/habits', { category, name }) as Promise<Habit>,
  rename: (id: number, name: string) => req('PUT', `/api/habits/${id}`, { name }) as Promise<Habit>,
  deactivate: (id: number) => req('DELETE', `/api/habits/${id}`) as Promise<Habit>,
  toggle: (id: number, day: string) =>
    req('POST', `/api/habits/${id}/toggle?day=${day}`) as Promise<{
      habit_id: number;
      day: string;
      done: boolean;
    }>,
  summary: (day: string) => req('GET', `/api/habits/summary?day=${day}`) as Promise<DaySummary>,
  streak: () => req('GET', '/api/habits/streak') as Promise<{ streak: number }>,
  week: () => req('GET', '/api/habits/week') as Promise<WeekScore[]>,
  getIntention: (day: string) =>
    req('GET', `/api/intentions/${day}`) as Promise<{ day: string; text: string }>,
  setIntention: (day: string, text: string) =>
    req('PUT', `/api/intentions/${day}`, { text }) as Promise<{ day: string; text: string }>,
};

export type ProjectKey = 'proj1' | 'proj2' | 'proj3' | 'proj4' | 'proj5' | 'proj6';

export interface Project {
  key: ProjectKey;
  name: string;
  accent_color: string;
  note: string;
  detail_note: string;
  note_bg: string | null;
  note_fg: string | null;
  target_minutes: number;
  running_since: number | null;
  is_named: boolean;
  secs_today: number;
  done_today: boolean;
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
  todayProgress: () => req('GET', '/api/projects/today-progress') as Promise<TodayProgress>,
  update: (key: ProjectKey, patch: Partial<Pick<Project, 'name' | 'note' | 'detail_note'>>) =>
    req('PUT', `/api/projects/${key}`, patch) as Promise<Project>,
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
};

export const nowApi = {
  get: () => req('GET', '/api/now') as Promise<Task | null>,
  setNow: (taskId: number) => req('POST', `/api/now/${taskId}`) as Promise<Task | null>,
  toggleRun: () => req('POST', '/api/now/toggle-run') as Promise<Task | null>,
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
  next_action: string;
  next_priority: NextPriority;
  next_deadline: string;
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

export interface Goal {
  id: number;
  project_key: ProjectKey;
  horizon: GoalHorizon;
  text: string;
  done: boolean;
  start_date: string;
  done_date: string | null;
  note: string;
  day_number: number;
}

export interface GoalPanel {
  project_key: ProjectKey;
  sec_title_yearly: string | null;
  sec_title_monthly: string | null;
  sec_title_weekly: string | null;
}

export const goalsApi = {
  list: (key: ProjectKey, horizon?: GoalHorizon) =>
    req('GET', `/api/projects/${key}/goals` + (horizon ? `?horizon=${horizon}` : '')) as Promise<Goal[]>,
  create: (key: ProjectKey, horizon: GoalHorizon, text: string, startDate?: string, note = '') =>
    req('POST', `/api/projects/${key}/goals`, {
      horizon,
      text,
      start_date: startDate ?? null,
      note,
    }) as Promise<Goal>,
  edit: (id: number, patch: Partial<Pick<Goal, 'text' | 'start_date' | 'note'>>) =>
    req('PUT', `/api/projects/goals/${id}`, patch) as Promise<Goal>,
  toggle: (id: number) => req('POST', `/api/projects/goals/${id}/toggle`) as Promise<Goal>,
  remove: (id: number) => req('DELETE', `/api/projects/goals/${id}`) as Promise<{ ok: true }>,
  getPanel: () => req('GET', '/api/goals/panel') as Promise<GoalPanel>,
  setPanelProject: (key: ProjectKey) =>
    req('POST', '/api/goals/panel/project', { project_key: key }) as Promise<GoalPanel>,
  setSectionTitle: (horizon: GoalHorizon, title: string) =>
    req('POST', '/api/goals/panel/section-title', { horizon, title }) as Promise<GoalPanel>,
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

export interface Journey {
  project_key: ProjectKey;
  proj_name: string;
  tagline: string;
  cover_image: string;
  attach_file: string;
  current_stage: number;
  launched: boolean;
  event: JourneyEvent;
  stages: JourneyStage[];
}

export const journeyApi = {
  get: (key: ProjectKey) => req('GET', `/api/projects/${key}/journey`) as Promise<Journey>,
  updateMeta: (key: ProjectKey, patch: Partial<Pick<Journey, 'proj_name' | 'tagline' | 'cover_image' | 'attach_file'>>) =>
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
};

export type Lang = 'en' | 'bn';

export interface Settings {
  theme: Theme;
  onboarded: boolean;
  lang: Lang;
  analog_clock: boolean;
  auto_timer_on_open: boolean;
  idle_stop_min: number;
  phase_morning_start: number;
  phase_work_start: number;
  phase_evening_start: number;
  phase_sleep_start: number;
  goal_hours: number;
  currency: string;
  start_with_windows: boolean;
}

export type SettingsPatch = Partial<
  Pick<
    Settings,
    | 'lang'
    | 'analog_clock'
    | 'auto_timer_on_open'
    | 'idle_stop_min'
    | 'phase_morning_start'
    | 'phase_work_start'
    | 'phase_evening_start'
    | 'phase_sleep_start'
    | 'goal_hours'
    | 'currency'
    | 'start_with_windows'
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
  addAction: (planId: number, text: string) =>
    req('POST', `/api/bdp/plans/${planId}/actions`, { text }) as Promise<BdpPlan>,
  editAction: (actionId: number, text: string) =>
    req('PUT', `/api/bdp/actions/${actionId}`, { text }) as Promise<BdpPlan>,
  toggleAction: (actionId: number) => req('POST', `/api/bdp/actions/${actionId}/toggle`) as Promise<BdpPlan>,
  deleteAction: (actionId: number) => req('DELETE', `/api/bdp/actions/${actionId}`) as Promise<BdpPlan>,
};

export type Q90AreaKey = 'appearance' | 'money' | 'relationship' | 'health' | 'social' | 'mind';
export type Q90Field = 'out' | 'act' | 'ifthen';

export interface Q90Area {
  key: Q90AreaKey;
  label: string;
  glyph: string;
  description: string;
  out: string;
  act: string;
  ifthen: string;
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
  setAnswer: (area: Q90AreaKey, field: Q90Field, text: string) =>
    req('POST', '/api/quarterly/answer', { area, field, text }) as Promise<Q90Panel>,
  setCycle: (start: string, days: number) =>
    req('POST', '/api/quarterly/cycle', { start, days }) as Promise<Q90Panel>,
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

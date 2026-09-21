# Daily Do's / Don'ts — Design

Date: 2026-09-22
Status: approved by user, ready for implementation plan

## Purpose

A standing list of daily behavioral commitments — "wake up early" (do), "stop smoking"
(don't) — checked off fresh every day, with a running streak per item. Distinct from
Tasks (one-off), Goals (long-horizon), and the 90-Day Plan's `weekly_lead_behavior`
(exactly one repeated behavior per area). This is many small binary daily habits, each
carrying its own priority and a freeform note on how it's tracked.

## Why here, and why not the existing patterns

Checked for a home before designing: no "Habits" feature actually exists in the app today
— `OnboardingModal.tsx` still advertises one ("Habits tracks daily checklists") that was
never built or was removed. `DisciplineModuleCards.tsx`'s own header comment documents a
prior flat Money/Health/Relation/Mind checklist that Zahid killed outright because it
"mainly regular chek kora hoy na" (isn't actually checked regularly) — replaced by 3
guided modules (Morning Ritual, Exercise/Sleep Procedure placeholders). A flat checklist
bolted onto an infrequently-opened screen is the exact shape that already failed once.

User's explicit choice after that trade-off was raised: put it in the 90-Day Plan panel
anyway, as one panel-wide section — not per-area, not inside Morning Ritual/Discipline. Noted as
a real risk (the panel is reviewed occasionally, not daily) but this is the user's
deliberate call, not an oversight.

## Scope

- One panel-wide list, split into DO and DON'T (same shape, `kind` field distinguishes).
- Persists across 90-day cycle rollovers — not scoped to `cycle_start`/`cycle_end`.
- Daily reset: each item's checked state is per-calendar-day, unchecked at the start of
  a new day.
- Simple streak only (consecutive days checked, walking backward from today). No trend
  chart, no calendar history view, no v1 analytics beyond the streak number.
- Client sets priority and tracking-basis manually per item — no computed/derived values.

## Data model

Its own table, own backend module — not bolted onto `quarterly_answers`, since it is
cycle-independent and not area-scoped:

```python
class HabitItem(Base):
    __tablename__ = "habit_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String)          # "do" | "dont"
    name: Mapped[str] = mapped_column(String)
    time: Mapped[str] = mapped_column(String, default="")             # freeform: "Morning", "07:00", "Anytime"
    priority: Mapped[str] = mapped_column(String, default="normal")   # "low" | "normal" | "high"
    tracking_basis: Mapped[str] = mapped_column(String, default="")   # freeform, client's own words
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # [{"date": "2026-09-22", "done": true}, ...] — one entry per day
    # it was ever checked or explicitly unchecked. Matches this app's
    # own established convention for list-shaped user data
    # (major_changes, goal_history) rather than a separate checkins
    # table — small, slow-growing, and the QuarterlyAnswer model's own
    # docstring already rejects "a complicated universal calculation
    # engine" for this class of feature.
    history: Mapped[list] = mapped_column(JSON, default=list)
```

One table for both DO and DON'T rows; `kind` splits it into two rendered lists
client-side. Matches `MajorChangesEditor`'s existing remove-by-X convention: delete is a
real row delete, no archive/soft-delete state.

Migration: new Alembic revision, `habit_items` table only — no changes to
`quarterly_answers` or any existing table.

## Backend

New `engine/habits.py` + `api/routes/habits.py`, registered in `api/server.py` alongside
the existing route modules.

- `GET /api/habits` — every row, each with today's `done` (derived: does `history`
  contain today's date with `done: true`) and a server-computed `streak` (walk `history`
  backward from today, count consecutive `done: true` days, stop at the first gap or
  missing day).
- `POST /api/habits` — create `{kind, name, time, priority, tracking_basis}`.
- `POST /api/habits/{id}/checkin` — `{date, done}`, upserts today's entry in `history`
  by date (idempotent — checking twice doesn't duplicate).
- `PATCH /api/habits/{id}` — edit `name`/`time`/`priority`/`tracking_basis`.
- `DELETE /api/habits/{id}` — real delete.
- `POST /api/habits/reorder` — `{ids: [...]}`, same shape as
  `quarterlyApi.reorderAreas`.

## Frontend

`renderer/src/services/api.ts`: new `habitsApi` object + `HabitItem`/`HabitKind` types,
same shape as the existing `quarterlyApi`/`Q90MajorChange` pair.

New component (`DoDontList.tsx` or similar — naming TBD at implementation time),
rendered once in `QuarterlyPlanPanel.tsx` right after the cycle progress bar and before
`panel.areas.map(...)` — the most-touched thing on the screen goes first, ahead of the
6 area rows.

Two stacked sections, DO then DON'T. Each row:
- checkbox — today's done state, posts to `/checkin` on change
- name (text, inline-editable like every other field in this app)
- time (short text)
- priority — click-to-cycle pill, same interaction as `IndividualTaskBoard.tsx`'s
  `NEXT_PRIORITY` cycling (normal → high → low → normal)
- tracking_basis — muted small text, inline-editable
- streak — a plain number with a flame/streak glyph, no chart
- delete (X button, same as `MajorChangesEditor`)

"+ Add" row per section, no cap on count (unlike the 5-item cap on `major_changes` —
these are meant to be a small standing set the user actually keeps, but there's no
strategic reason to hard-limit it the way a "key changes" list needs limiting).

## Error handling

Standard pattern already used throughout this session's audit fixes: `.catch` on the
initial `GET /api/habits` load, `loadError` state, inline retry banner — matching what
`ProjectDashboard.tsx`/`JourneyPanel.tsx`/`GoalsPanel.tsx` now do.

## Testing

- Backend: unit test for streak computation (empty history, single day, broken streak,
  streak spanning a month boundary) — mirrors `test_quarterly.py`'s existing style.
- Frontend: no new UI test infra introduced; verified manually via the `run-habit-os`
  skill (launch app, add a do/don't item, check it off, confirm streak increments,
  confirm it survives a reload) same as every other feature verified this session.
- No new spacing/typography/radius scale values — reuse `SPACE`/`TYPE_SIZE`/`RADIUS`
  tokens exclusively; `npm test` (now pre-commit-gated) catches any drift.

## Explicitly out of scope (v1)

- Trend/calendar history view (only a streak number).
- Per-area habit lists.
- Archiving instead of deleting.
- Reminders/notifications tied to the `time` field (it's a label, not a scheduled alarm).

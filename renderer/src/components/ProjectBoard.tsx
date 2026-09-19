// DEPRECATED — superseded by IndividualTaskBoard.tsx + GoalBoardOverlay.tsx.
//
// This was the flat per-project Focus Board (Panel 2's old BOARD tab):
// one shared board per project, cards optionally backlinked to a goal
// via `goal_id`. The user corrected the design to a 3-level hierarchy
// — Goal -> Task (1..N) -> that Task's own Individual Task Board — and
// the backend (`board_cards`/`board_tasks` tables, `boardApi`) was
// migrated to match (see alembic revision f0b918f2854d). This
// component's calls to the old project-scoped `boardApi.list(key)`
// shape no longer match that API at all.
//
// Left in place, unused, rather than deleted: the device bridge to
// Zahid's machine can't delete files (a Windows update from Sept 8
// blocks it — see the standing note in this repo's session history),
// same reason StrikeCard.tsx was orphaned earlier. Not imported by
// App.tsx or anything else — safe to delete by hand once file access
// is restored.
export default function ProjectBoard(_props: { projectKey: string | null }) {
  return null;
}

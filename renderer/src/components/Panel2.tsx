// DEPRECATED — superseded by rendering GoalsPanel directly in App.tsx.
//
// This was the GOALS|BOARD tab switcher for Panel 2 (paired with the
// now-also-deprecated ProjectBoard.tsx). The user corrected the Board
// feature's shape: a goal breaks into Tasks, and each Task gets its
// own full board — too much for this narrow ~440px column, and the
// user explicitly chose to open it as a full-window overlay instead
// (GoalBoardOverlay.tsx, reached from GoalsPanel/GoalRow's "→ BOARD"
// button). Panel 2 therefore went back to showing GoalsPanel alone,
// the same as before this Board feature existed.
//
// Left in place, unused, rather than deleted: the device bridge to
// Zahid's machine can't delete files (a Windows update from Sept 8
// blocks it — see the standing note in this repo's session history),
// same reason StrikeCard.tsx was orphaned earlier. Not imported by
// App.tsx or anything else — safe to delete by hand once file access
// is restored.
export default function Panel2(_props: { projectKey: string | null }) {
  return null;
}

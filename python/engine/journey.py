import time
from datetime import date

from database.models import JourneyLogEntry, JourneyStage, JourneyTask
from database.repository import JourneyRepository

STAGE_COUNT = 6
LOG_STATUS_ORDER = ("", "ok", "no")


def _today() -> str:
    return str(date.today())


class JourneyEngine:
    def __init__(self, repo: JourneyRepository):
        self.repo = repo

    # ── Derived state — never stored, matches engine.now's NOW pointer:
    # a stored "current stage" could drift from the rule that actually
    # defines it, so it's recomputed live on every read instead. ──────
    @staticmethod
    def _stage_done(stage: JourneyStage, tasks: list[JourneyTask]) -> bool:
        """gate written -> the gate's tick decides, and ONLY it (tasks
        become supporting detail). gate empty -> every task done, and at
        least one exists. Matches legacy's _stage_done exactly."""
        if (stage.gate or "").strip():
            return bool(stage.gate_done)
        return bool(tasks) and all(t.done for t in tasks)

    def _tasks_by_stage(self, project_key: str) -> dict[int, list[JourneyTask]]:
        by_stage: dict[int, list[JourneyTask]] = {i: [] for i in range(STAGE_COUNT)}
        for t in self.repo.list_tasks(project_key):
            by_stage[t.stage_index].append(t)
        return by_stage

    def _logs_by_stage(self, project_key: str) -> dict[int, list[JourneyLogEntry]]:
        by_stage: dict[int, list[JourneyLogEntry]] = {i: [] for i in range(STAGE_COUNT)}
        for entry in self.repo.list_logs(project_key):
            by_stage[entry.stage_index].append(entry)
        return by_stage

    def _current_stage(self, stages: list[JourneyStage], tasks_by_stage: dict[int, list[JourneyTask]]) -> int:
        """The first not-yet-done stage — matches legacy's
        _recompute_stage, run live instead of cached."""
        for stage in stages:
            if not self._stage_done(stage, tasks_by_stage[stage.stage_index]):
                return stage.stage_index
        return STAGE_COUNT - 1

    def _require_stage(self, project_key: str, stage_index: int) -> JourneyStage:
        if not 0 <= stage_index < STAGE_COUNT:
            raise ValueError(f"stage_index must be 0-{STAGE_COUNT - 1}")
        stage = self.repo.get_stage(project_key, stage_index)
        if stage is None:
            raise ValueError("Stage not found")
        return stage

    def get(self, project_key: str, event: str | None = None) -> dict:
        journey = self.repo.get_journey(project_key)
        if journey is None:
            raise ValueError("Journey not found")
        stages = self.repo.list_stages(project_key)
        tasks_by_stage = self._tasks_by_stage(project_key)
        logs_by_stage = self._logs_by_stage(project_key)

        current = self._current_stage(stages, tasks_by_stage)
        launched = current == STAGE_COUNT - 1 and all(
            self._stage_done(s, tasks_by_stage[s.stage_index]) for s in stages
        )

        return {
            "project_key": project_key,
            "proj_name": journey.proj_name,
            "tagline": journey.tagline,
            "cover_image": journey.cover_image,
            "attach_file": journey.attach_file,
            "current_stage": current,
            "launched": launched,
            "event": event,
            "stages": [
                {
                    "stage_index": s.stage_index,
                    "name": s.name,
                    "description": s.description,
                    "gate": s.gate,
                    "gate_done": s.gate_done,
                    "done": self._stage_done(s, tasks_by_stage[s.stage_index]),
                    "tasks": tasks_by_stage[s.stage_index],
                    "logs": logs_by_stage[s.stage_index],
                }
                for s in stages
            ],
        }

    def _respond_with_event(self, project_key: str, prev_current: int) -> dict:
        """Matches legacy's launched/advanced toast logic exactly —
        computed once, right after the ONE mutation (gate toggle or task
        toggle) that can move the stage pointer forward. Every other
        mutation (rename, edit, delete, log entries, editing gate TEXT
        without ticking it) never fires a toast, matching legacy, even
        though a task delete can technically also complete a stage —
        legacy doesn't check there either, so neither does the port."""
        stages = self.repo.list_stages(project_key)
        tasks_by_stage = self._tasks_by_stage(project_key)
        new_current = self._current_stage(stages, tasks_by_stage)
        launched = new_current == STAGE_COUNT - 1 and all(
            self._stage_done(s, tasks_by_stage[s.stage_index]) for s in stages
        )
        advanced = new_current > prev_current and not launched
        event = "launched" if launched else ("advanced" if advanced else None)
        return self.get(project_key, event=event)

    # ── Journey header ────────────────────────────────────────────────
    def update_meta(
        self,
        project_key: str,
        proj_name: str | None = None,
        tagline: str | None = None,
        cover_image: str | None = None,
        attach_file: str | None = None,
    ) -> dict:
        journey = self.repo.get_journey(project_key)
        if journey is None:
            raise ValueError("Journey not found")
        if proj_name is not None:
            journey.proj_name = proj_name.strip()
        if tagline is not None:
            journey.tagline = tagline.strip()
        if cover_image is not None:
            journey.cover_image = cover_image
        if attach_file is not None:
            journey.attach_file = attach_file
        self.repo.save_journey(journey)
        return self.get(project_key)

    # ── Stages ────────────────────────────────────────────────────────
    def update_stage_meta(
        self, project_key: str, stage_index: int, name: str | None = None, description: str | None = None
    ) -> dict:
        stage = self._require_stage(project_key, stage_index)
        if name is not None and name.strip():
            stage.name = name.strip()
        if description is not None:
            stage.description = description.strip()
        self.repo.save_stage(stage)
        return self.get(project_key)

    def set_gate(self, project_key: str, stage_index: int, gate: str) -> dict:
        stage = self._require_stage(project_key, stage_index)
        stage.gate = gate.strip()
        # Clearing the text hands the stage back to the all-tasks-done
        # rule, so a stale tick must not linger — matches legacy.
        if not stage.gate:
            stage.gate_done = False
        self.repo.save_stage(stage)
        return self.get(project_key)

    def toggle_gate(self, project_key: str, stage_index: int) -> dict:
        stage = self._require_stage(project_key, stage_index)
        if not (stage.gate or "").strip():
            # Matches legacy: nothing to tick yet. Prompting the user to
            # write one is a UI concern (opening the edit dialog) — the
            # engine just no-ops rather than guessing text for them.
            return self.get(project_key)
        prev_current = self._current_stage(self.repo.list_stages(project_key), self._tasks_by_stage(project_key))
        stage.gate_done = not stage.gate_done
        self.repo.save_stage(stage)
        return self._respond_with_event(project_key, prev_current)

    # ── Tasks ─────────────────────────────────────────────────────────
    def add_task(self, project_key: str, stage_index: int, text: str) -> dict:
        self._require_stage(project_key, stage_index)  # validates stage_index + project
        text = text.strip()
        if not text:
            raise ValueError("Task text cannot be empty")
        task = JourneyTask(
            id=int(time.time() * 1000), project_key=project_key, stage_index=stage_index, text=text, done=False
        )
        self.repo.add_task(task)
        return self.get(project_key)

    def edit_task(self, task_id: int, text: str) -> dict:
        task = self.repo.get_task(task_id)
        if task is None:
            raise ValueError("Task not found")
        text = text.strip()
        if text:
            task.text = text
        self.repo.save_task(task)
        return self.get(task.project_key)

    def toggle_task(self, task_id: int) -> dict:
        task = self.repo.get_task(task_id)
        if task is None:
            raise ValueError("Task not found")
        project_key = task.project_key
        prev_current = self._current_stage(self.repo.list_stages(project_key), self._tasks_by_stage(project_key))
        task.done = not task.done
        self.repo.save_task(task)
        return self._respond_with_event(project_key, prev_current)

    def delete_task(self, task_id: int) -> dict:
        task = self.repo.get_task(task_id)
        if task is None:
            raise ValueError("Task not found")
        project_key = task.project_key
        self.repo.delete_task(task)
        return self.get(project_key)

    # ── Log entries ───────────────────────────────────────────────────
    def add_log(self, project_key: str, stage_index: int, text: str) -> dict:
        self._require_stage(project_key, stage_index)
        text = text.strip()
        if not text:
            raise ValueError("Log entry cannot be empty")
        entry = JourneyLogEntry(
            id=int(time.time() * 1000),
            project_key=project_key,
            stage_index=stage_index,
            text=text,
            date=_today(),
            status="",
        )
        self.repo.add_log(entry)
        return self.get(project_key)

    def cycle_log_status(self, entry_id: int) -> dict:
        """·  ->  ok (worked)  ->  no (didn't work)  ->  ·"""
        entry = self.repo.get_log(entry_id)
        if entry is None:
            raise ValueError("Log entry not found")
        i = LOG_STATUS_ORDER.index(entry.status) if entry.status in LOG_STATUS_ORDER else 0
        entry.status = LOG_STATUS_ORDER[(i + 1) % len(LOG_STATUS_ORDER)]
        self.repo.save_log(entry)
        return self.get(entry.project_key)

    def delete_log(self, entry_id: int) -> dict:
        entry = self.repo.get_log(entry_id)
        if entry is None:
            raise ValueError("Log entry not found")
        project_key = entry.project_key
        self.repo.delete_log(entry)
        return self.get(project_key)

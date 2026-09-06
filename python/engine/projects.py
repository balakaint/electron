import time
from datetime import date, timedelta

from database.models import CirclePerson, Project, ProjectSubtask
from database.repository import ProjectRepository
from engine.timer_reconciliation import start_project, stop_project

_TARGET_MIN, _TARGET_MAX, _TARGET_STEP_MIN = 5, 600, 5


def _today() -> str:
    return str(date.today())


class ProjectEngine:
    def __init__(self, repo: ProjectRepository):
        self.repo = repo

    # ── Projects ──────────────────────────────────────────────────────
    def list_projects(self) -> list[Project]:
        return self.repo.list()

    def project_to_dict(self, project: Project) -> dict:
        return {
            "key": project.key,
            "name": project.name,
            "accent_color": project.accent_color,
            "note": project.note,
            "detail_note": project.detail_note,
            "note_bg": project.note_bg,
            "note_fg": project.note_fg,
            "target_minutes": project.target_minutes,
            "running_since": project.running_since,
            "is_named": self.is_named(project),
            "secs_today": self.secs_today(project.key),
            "done_today": self.done_today(project),
        }

    def get_project(self, key: str) -> Project | None:
        return self.repo.get(key)

    def update_project(
        self,
        key: str,
        name: str | None = None,
        note: str | None = None,
        detail_note: str | None = None,
        note_bg: str | None = None,
        note_fg: str | None = None,
    ) -> Project | None:
        project = self.repo.get(key)
        if project is None:
            return None
        if name is not None:
            project.name = name
        if note is not None:
            project.note = note
        if detail_note is not None:
            project.detail_note = detail_note
        if note_bg is not None:
            project.note_bg = note_bg
        if note_fg is not None:
            project.note_fg = note_fg
        return self.repo.save(project)

    def bump_target(self, key: str, delta: int) -> Project | None:
        project = self.repo.get(key)
        if project is None:
            return None
        project.target_minutes = max(
            _TARGET_MIN, min(_TARGET_MAX, project.target_minutes + delta)
        )
        return self.repo.save(project)

    def is_named(self, project: Project) -> bool:
        """An unnamed slot is an empty slot, not a neglected project —
        matches _named_projects, which excludes it from totals."""
        return bool((project.name or "").strip())

    def secs_today(self, key: str) -> float:
        row = self.repo.get_activity(key, _today())
        return row.secs if row is not None else 0.0

    def done_today(self, project: Project) -> bool:
        """Has this project met its own daily target today?"""
        target_secs = project.target_minutes * 60.0
        return target_secs > 0 and self.secs_today(project.key) >= target_secs

    def toggle_timer(self, key: str) -> Project | None:
        """Stop credits elapsed time (day-split, idle-capped) and clears
        running_since; start enforces single-running-project exclusivity
        first. See engine.timer_reconciliation for why elapsed isn't
        just `time.time() - running_since` credited in one lump."""
        project = self.repo.get(key)
        if project is None:
            return None
        if project.running_since is not None:
            stop_project(self.repo, project)
        else:
            start_project(self.repo, project)
        return self.repo.save(project)

    def set_manual_mark(self, key: str, day: str, mark: bool) -> None:
        row = self.repo.get_or_create_activity(key, day)
        row.manual_mark = mark
        self.repo.save_activity(row)

    def activity_strip(self, key: str, num_days: int = 30) -> list[dict]:
        """One entry per day, oldest first — the 30-day strip. A day
        counts as "worked" if the timer met the target OR it carries a
        manual override mark (clicking a cell can only ADD a day the
        timer missed, never erase one it already proved)."""
        project = self.repo.get(key)
        target_secs = (project.target_minutes if project else 60) * 60.0
        days = [str(date.today() - timedelta(days=i)) for i in range(num_days - 1, -1, -1)]
        rows = self.repo.activity_range(key, days)
        out = []
        for d in days:
            row = rows.get(d)
            secs = row.secs if row else 0.0
            manual = row.manual_mark if row else False
            auto = target_secs > 0 and secs >= target_secs
            out.append({"day": d, "secs": secs, "worked": auto or manual})
        return out

    def named_projects(self) -> list[Project]:
        return [p for p in self.repo.list() if self.is_named(p)]

    def project_order(self) -> list[dict]:
        """[(number, project)] — finished sinks to the bottom, matching
        _project_order. Number is the project's fixed position (1-6),
        not its row in this list, so it stays stable across the sink."""
        projects = self.repo.list()
        numbered = [
            {"number": i, "project": p, "_p": p} for i, p in enumerate(projects, start=1)
        ]
        numbered.sort(key=lambda e: 1 if self.done_today(e["_p"]) else 0)
        return [
            {"number": e["number"], "project": self.project_to_dict(e["_p"])}
            for e in numbered
        ]

    def today_progress(self) -> dict:
        named = self.named_projects()
        total_target = sum(p.target_minutes * 60.0 for p in named)
        total_secs = sum(self.secs_today(p.key) for p in named)
        return {
            "secs": total_secs,
            "target_secs": total_target,
            "pct": int(total_secs / total_target * 100) if total_target else 0,
            "projects_done": sum(1 for p in named if self.done_today(p)),
            "projects_total": len(named),
        }

    # ── Subtasks ──────────────────────────────────────────────────────
    def list_subtasks(self, key: str) -> list[ProjectSubtask]:
        return self.repo.list_subtasks(key)

    def add_subtask(self, key: str, text: str) -> ProjectSubtask:
        text = text.strip()
        if not text:
            raise ValueError("Subtask text cannot be empty")
        idx = len(self.repo.list_subtasks(key))
        pid = f"{key}:{int(time.time() * 1000)}:{idx}"
        subtask = ProjectSubtask(pid=pid, project_key=key, text=text, done=False, added_date=_today())
        return self.repo.add_subtask(subtask)

    def toggle_subtask(self, pid: str) -> ProjectSubtask | None:
        subtask = self.repo.get_subtask(pid)
        if subtask is None:
            return None
        subtask.done = not subtask.done
        return self.repo.save_subtask(subtask)

    def delete_subtask(self, pid: str) -> bool:
        subtask = self.repo.get_subtask(pid)
        if subtask is None:
            return False
        self.repo.delete_subtask(subtask)
        return True

    # ── Accountability circle ────────────────────────────────────────
    def list_people(self, project_key: str | None) -> list[dict]:
        """Worst-gap-first: overdue (or never-contacted) people first,
        matching the legacy _sortkey (gap - cadence, descending)."""
        people = self.repo.list_people(project_key)

        def sort_key(p: CirclePerson):
            gap = self._gap(p)
            over = (gap if gap is not None else 10**6) - p.cadence_days
            return -over

        return [self._person_out(p) for p in sorted(people, key=sort_key)]

    def add_person(self, project_key: str | None, name: str, cadence_days: int = 7) -> dict:
        name = name.strip()
        if not name:
            raise ValueError("Name cannot be empty")
        person = CirclePerson(
            id=int(time.time() * 1000),
            project_key=project_key,
            name=name,
            cadence_days=cadence_days,
            last_contact=None,
        )
        return self._person_out(self.repo.add_person(person))

    def mark_contacted(self, person_id: int) -> dict | None:
        person = self.repo.get_person(person_id)
        if person is None:
            return None
        person.last_contact = _today()
        return self._person_out(self.repo.save_person(person))

    def update_person(
        self, person_id: int, name: str | None = None, cadence_days: int | None = None
    ) -> dict | None:
        person = self.repo.get_person(person_id)
        if person is None:
            return None
        if name is not None and name.strip():
            person.name = name.strip()
        if cadence_days is not None:
            person.cadence_days = max(1, cadence_days)
        return self._person_out(self.repo.save_person(person))

    def delete_person(self, person_id: int) -> bool:
        person = self.repo.get_person(person_id)
        if person is None:
            return False
        self.repo.delete_person(person)
        return True

    def adopt_person(self, person_id: int, project_key: str) -> dict | None:
        """Move a person off the legacy unassigned (project_key=None)
        list onto a project."""
        person = self.repo.get_person(person_id)
        if person is None or person.project_key is not None:
            return None
        person.project_key = project_key
        return self._person_out(self.repo.save_person(person))

    @staticmethod
    def _gap(person: CirclePerson) -> int | None:
        if not person.last_contact:
            return None
        try:
            last = date.fromisoformat(person.last_contact)
        except ValueError:
            return None
        return max(0, (date.today() - last).days)

    def _person_out(self, person: CirclePerson) -> dict:
        gap = self._gap(person)
        return {
            "id": person.id,
            "project_key": person.project_key,
            "name": person.name,
            "cadence_days": person.cadence_days,
            "last_contact": person.last_contact,
            "gap_days": gap,
            "overdue": gap is None or gap > person.cadence_days,
        }

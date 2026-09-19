"""Night Closure — the evening counterpart to Morning Ritual
(engine/morning_ritual.py). Converted from Zahid's own HTML/JS mockup
(night-closure.html, localStorage key `lifeos_night_closure`) to real
per-day persistence.

One continuous card, not a wizard: four top fields (Where I stopped /
Unfinished / Tomorrow's Outcome / Tomorrow's First Move) + an optional
Blocker/Note pair + a Close Time input, then an optional, collapsed-by-
default Wind Down section (4-7-8 Breathe / Cognitive Shuffle / Muscle
Release — all three run client-side only, nothing here persists their
state, matching the mockup). Every setter auto-saves, same convention
as morning_ritual.py — there is no separate "save" step; "Close the
day" only stamps `closed_at`.

`tomorrow_outcome`/`tomorrow_first_action` are read back the next
morning by MorningRitualEngine's carry-forward (see that module) to
populate `today_outcome`/`first_move` and set `carried_from_date` — the
whole reason this table exists.
"""

from datetime import date
import time

from database.models import NightClosure
from database.repository import NightClosureRepository


def _today() -> str:
    return str(date.today())


def _now() -> float:
    return time.time()


class NightClosureEngine:
    def __init__(self, repo: NightClosureRepository):
        self.repo = repo

    def get_today(self) -> dict:
        return self._out(self._touch(_today()))

    def _touch(self, day: str) -> NightClosure:
        return self.repo.get_or_create(day)

    def set_where_stopped(self, text: str) -> dict:
        row = self._touch(_today())
        row.where_stopped = text.strip()
        return self._out(self.repo.save(row))

    def set_unfinished(self, text: str) -> dict:
        row = self._touch(_today())
        row.unfinished = text.strip()
        return self._out(self.repo.save(row))

    def set_tomorrow_outcome(self, text: str) -> dict:
        row = self._touch(_today())
        row.tomorrow_outcome = text.strip()
        return self._out(self.repo.save(row))

    def set_tomorrow_first_action(self, text: str) -> dict:
        row = self._touch(_today())
        row.tomorrow_first_action = text.strip()
        return self._out(self.repo.save(row))

    def set_optional_blocker(self, text: str) -> dict:
        row = self._touch(_today())
        row.optional_blocker = text.strip()
        return self._out(self.repo.save(row))

    def set_optional_note(self, text: str) -> dict:
        row = self._touch(_today())
        row.optional_note = text.strip()
        return self._out(self.repo.save(row))

    def set_close_time(self, value: str) -> dict:
        row = self._touch(_today())
        row.close_time = value
        return self._out(self.repo.save(row))

    def close_day(self) -> dict:
        """Idempotent, same shape as MorningRitualEngine.start_now — the
        first press stamps closed_at; a repeated press (reopening the
        panel later the same night) changes nothing."""
        row = self._touch(_today())
        if row.closed_at is None:
            row.closed_at = _now()
        return self._out(self.repo.save(row))

    @staticmethod
    def _out(row: NightClosure) -> dict:
        return {
            "day": row.day,
            "where_stopped": row.where_stopped,
            "unfinished": row.unfinished,
            "tomorrow_outcome": row.tomorrow_outcome,
            "tomorrow_first_action": row.tomorrow_first_action,
            "optional_blocker": row.optional_blocker,
            "optional_note": row.optional_note,
            "close_time": row.close_time,
            "closed_at": row.closed_at,
        }

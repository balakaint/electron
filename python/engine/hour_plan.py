"""The day cut into 24 hours, grouped into the four day-phase blocks.

Ported from legacy's TODAY EXECUTION screen (task_tracker_v3_THEMES.py
5487-5830). Legacy shows it on EXECUTE; this port shows it as the TODAY
tab of the PLAN review card, which is a deliberate placement change and
the only one — the logic below is legacy's.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

# Morning · Work · Evening · Sleep, in the order the PLAN screen's phase
# bars already list them, which is also the order you live the day.
# Explicitly NOT sorted by clock hour: that would float Sleep to the top
# because it owns midnight (legacy 5501-5504).
BLOCKS: tuple[tuple[str, str], ...] = (
    ("morning", "Morning"),
    ("work", "Work"),
    ("evening", "Evening"),
    ("sleep", "Sleep"),
)

_SETTING_FOR = {
    "morning": "phase_morning_start",
    "work": "phase_work_start",
    "evening": "phase_evening_start",
    "sleep": "phase_sleep_start",
}


@dataclass(frozen=True)
class Block:
    key: str
    name: str
    hours: list[int]


def block_hours(starts: dict[str, int]) -> list[Block]:
    """Assign every hour 0-23 to exactly one block.

    Each hour goes to the phase whose start it most recently passed,
    counting backwards around the clock. That IS the definition of
    "which phase am I in", and computing it per hour is what makes it
    impossible to lose or duplicate one.

    Legacy's note on the bug this shape fixes (5518-5526): the obvious
    implementation is range(start, end) per block, which silently assumes
    morning < work < evening < sleep. The four settings are clamped 0-23
    INDEPENDENTLY — nothing stops Sleep at 00:00, or Morning after Work.
    Legacy reports that most such schedules broke: hours in two blocks at
    once (one line of text shown twice, ticking either ticking both), or
    blocks of 42 hours. Only an already-sorted schedule worked.

    test_hour_plan.py checks all 24^4 = 331,776 combinations rather than
    a few examples, because a few examples pass against the broken one.
    """
    norm = {k: int(starts[k]) % 24 for k, _ in BLOCKS}
    owner: dict[int, str] = {}
    for h in range(24):
        best, best_d = None, 99
        for k, _ in BLOCKS:
            d = (h - norm[k]) % 24
            if d < best_d:  # ties: the first block listed wins
                best_d, best = d, k
        owner[h] = best  # type: ignore[assignment]

    out = []
    for key, name in BLOCKS:
        hs = [h for h in range(24) if owner[h] == key]
        # Read from the block's own start hour, so Sleep runs
        # 11pm, 12am, 1am rather than 12am … 11pm.
        hs.sort(key=lambda h, _s=norm[key]: (h - _s) % 24)
        out.append(Block(key=key, name=name, hours=hs))
    return out


def current_block(starts: dict[str, int], now_hour: int | None = None) -> str:
    h = time.localtime().tm_hour if now_hour is None else now_hour
    for b in block_hours(starts):
        if h in b.hours:
            return b.key
    return "work"


class HourPlanEngine:
    def __init__(self, repo):
        self.repo = repo

    def _starts(self) -> dict[str, int]:
        s = self.repo.get_app_state()
        return {k: getattr(s, field) for k, field in _SETTING_FOR.items()}

    def day(self, day: str, now_hour: int | None = None) -> dict:
        slots = {row.hour: row for row in self.repo.hour_slots(day)}
        starts = self._starts()

        blocks = []
        total_done = total_planned = 0
        for b in block_hours(starts):
            hours = []
            done = planned = 0
            for h in b.hours:
                row = slots.get(h)
                text = (row.text if row is not None else "") or ""
                is_done = bool(row.done) if row is not None else False
                repeats = bool(row.repeat) if row is not None else False
                # "planned" means a slot with text in it. An empty hour
                # is not a task you failed to do (legacy 5565-5567).
                if text.strip():
                    planned += 1
                    if is_done:
                        done += 1
                hours.append(
                    {
                        "id": row.id if row is not None else None,
                        "hour": h,
                        "text": text,
                        "done": is_done,
                        "repeat": repeats,
                    }
                )
            total_done += done
            total_planned += planned
            blocks.append(
                {"key": b.key, "name": b.name, "hours": hours, "done": done, "planned": planned}
            )

        return {
            "day": day,
            "current_block": current_block(starts, now_hour),
            "total_done": total_done,
            "total_planned": total_planned,
            "blocks": blocks,
        }

    def set_slot(
        self,
        day: str,
        hour: int,
        text: str | None = None,
        done: bool | None = None,
        repeat: bool | None = None,
    ) -> dict:
        if not 0 <= hour <= 23:
            raise ValueError(f"hour must be 0-23, got {hour}")
        row = self.repo.set_hour_slot(day, hour, text=text, done=done, repeat=repeat)
        return {"id": row.id, "hour": row.hour, "text": row.text, "done": row.done, "repeat": row.repeat}

    def clear_slot(self, day: str, hour: int) -> dict:
        # Clearing the text ends the carry too — the repository drops
        # `repeat` with it, because an empty entry has nothing to keep
        # asking about.
        return self.set_slot(day, hour, text="", done=False)

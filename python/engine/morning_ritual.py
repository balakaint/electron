"""Morning Ritual — rebuilt 2026-09-15 to match Zahid's fuller "Morning
Activation" brainstorm prototype (an HTML/JS mockup he uploaded this
round, superseding the original linear 7-step wizard shipped a day
earlier — see database/models.py's MorningRitual docstring for the full
scoping history and what's deliberately deferred).

This is ONE continuous page, not a step-locked wizard: SEE (today's
outcome/first move, carried from yesterday once Night Closure exists) ->
CHECK-IN (energy/mood/sleep) + RESET (breathe/move/daylight) -> CLEAR
YOUR MIND (journal, optional action) -> MORNING PRIME (meditate /
visualize / read / ground / spiritual — collapsed by default) -> START
NOW (KPI: time to first action). Every method below reads/writes its
own fields directly; there is no step index to advance or reject "out
of order" moves for, unlike v1.
"""

from datetime import date, datetime, timedelta
import calendar
import re
import time

from database.models import MorningRitual
from database.repository import MorningRitualRepository, NightClosureRepository

ENERGY_VALUES = ("LOW", "OKAY", "GOOD", "STRONG")
MOOD_VALUES = ("LOW", "NEUTRAL", "GOOD", "POSITIVE")
SLEEP_VALUES = ("POOR", "OKAY", "GOOD")
INTENTION_VALUES = ("Focus", "Patience", "Discipline", "Calm")
SPIRITUAL_VALUES = ("OFF", "Prayer", "Dhikr", "Quran", "Meditation", "Personal Reflection", "Custom")

# Matches the prototype's own modeMap exactly (morning-activation.html,
# the wirePillGroup('[data-group="energy"]') handler): LOW keeps things
# short (Gentle), STRONG opens things up (Fast), the middle two are
# ordinary (Standard).
ENERGY_MODE_MAP = {"LOW": "gentle", "OKAY": "standard", "GOOD": "standard", "STRONG": "fast"}

# Placeholder heuristic only (Zahid's own choice over wiring up a real
# AI call this round — see the model docstring). In the prototype this
# was explicitly commented as a stand-in for an offline Ollama coach;
# same status here. Picks the first sentence containing an action verb,
# falling back to the first sentence, then the raw text — matches the
# prototype's suggestFromJournal exactly, word list included.
_ACTION_WORDS = re.compile(
    r"\b(follow up|contact|call|email|finish|send|fix|write|review|open|reply|schedule|submit|book|pay|order)\b",
    re.IGNORECASE,
)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def suggest_action(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    sentences = [s for s in _SENTENCE_SPLIT.split(text) if s]
    hit = next((s for s in sentences if _ACTION_WORDS.search(s)), None)
    chosen = hit or (sentences[0] if sentences else text)
    return chosen.strip()[:140]


def _today() -> str:
    return str(date.today())


def _now() -> float:
    return time.time()


def _fmt_12h(hhmm: str) -> str:
    """"23:42" -> "11:42 PM" for the History list's text — the raw
    "HH:MM" the time input hands back reads fine in a native picker,
    not as prose next to a sentence."""
    try:
        return datetime.strptime(hhmm, "%H:%M").strftime("%I:%M %p").lstrip("0")
    except ValueError:
        return hhmm


def _sleep_duration(close_hhmm: str, wake_hhmm: str) -> str | None:
    """Hours:minutes between a close time and the following wake time,
    always forward across midnight — a close time is always "last
    night", a wake time always "this morning", so a same-or-earlier
    clock reading always means it wrapped past midnight, never that
    zero or negative time passed."""
    try:
        close = datetime.strptime(close_hhmm, "%H:%M")
        wake = datetime.strptime(wake_hhmm, "%H:%M")
    except ValueError:
        return None
    delta = wake - close
    if delta.total_seconds() <= 0:
        delta += timedelta(days=1)
    total_minutes = round(delta.total_seconds() / 60)
    hours, minutes = divmod(total_minutes, 60)
    return f"{hours}h {minutes}m"


class MorningRitualEngine:
    def __init__(self, repo: MorningRitualRepository, night_closure_repo: NightClosureRepository | None = None):
        self.repo = repo
        # Optional so existing callers/tests that construct this engine
        # without a Night Closure repo keep working unchanged — carry-
        # forward is simply skipped when it's not supplied.
        self.night_closure_repo = night_closure_repo

    # ── Today ─────────────────────────────────────────────────────────
    def get_today(self) -> dict:
        return self._out(self._touch(_today()))

    def _touch(self, day: str) -> MorningRitual:
        """Fetch-or-create today's row and stamp started_at the first
        time it's ever touched (page load), without disturbing it on
        later touches — this is the earlier end of the "time to first
        action" KPI, so it must be a real, one-time-only stamp."""
        existing = self.repo.get(day)
        row = self.repo.get_or_create(day)
        if existing is None:
            self._apply_carry_forward(row, day)
        if row.started_at is None:
            row.started_at = _now()
            self.repo.save(row)
        return row

    def _apply_carry_forward(self, row: MorningRitual, day: str) -> None:
        """Pulls last night's Night Closure (if any) into today's blank
        row — see NightClosure's own docstring for the link. Runs once,
        only on the row's very first touch (the caller already checked
        that), so it can never overwrite something the user typed."""
        if self.night_closure_repo is None:
            return
        prev_day = str(date.fromisoformat(day) - timedelta(days=1))
        prev = self.night_closure_repo.get(prev_day)
        if prev is None:
            return
        if prev.tomorrow_outcome:
            row.today_outcome = prev.tomorrow_outcome
        if prev.tomorrow_first_action:
            row.first_move = prev.tomorrow_first_action
        row.carried_from_date = prev_day
        self.repo.save(row)

    # ── SEE ───────────────────────────────────────────────────────────
    def set_outcome(self, text: str) -> dict:
        row = self._touch(_today())
        row.today_outcome = text.strip()
        return self._out(self.repo.save(row))

    def set_first_move(self, text: str) -> dict:
        row = self._touch(_today())
        row.first_move = text.strip()
        return self._out(self.repo.save(row))

    # ── CHECK-IN ──────────────────────────────────────────────────────
    def set_checkin(
        self,
        energy: str | None,
        mood: str | None,
        sleep_quality: str | None = None,
        wake_up_time: str | None = None,
    ) -> dict:
        row = self._touch(_today())
        if energy is not None:
            if energy not in ENERGY_VALUES:
                raise ValueError(f"invalid energy: {energy!r}")
            row.energy = energy
            row.morning_mode = ENERGY_MODE_MAP[energy]
        if mood is not None:
            if mood not in MOOD_VALUES:
                raise ValueError(f"invalid mood: {mood!r}")
            row.mood = mood
        if sleep_quality is not None:
            if sleep_quality not in SLEEP_VALUES:
                raise ValueError(f"invalid sleep_quality: {sleep_quality!r}")
            row.sleep_quality = sleep_quality
        if wake_up_time is not None:
            row.wake_up_time = wake_up_time
        return self._out(self.repo.save(row))

    # ── RESET ─────────────────────────────────────────────────────────
    def mark_breathe_done(self) -> dict:
        """One-way, matching the prototype's 60s Breathe chip — it
        finishes and stays done, there's no un-doing a breathing
        exercise already taken."""
        row = self._touch(_today())
        row.reset_breathe = True
        return self._out(self.repo.save(row))

    def set_reset_move(self, done: bool) -> dict:
        row = self._touch(_today())
        row.reset_move = bool(done)
        return self._out(self.repo.save(row))

    def set_reset_daylight(self, done: bool) -> dict:
        row = self._touch(_today())
        row.reset_daylight = bool(done)
        return self._out(self.repo.save(row))

    def set_reset_water(self, done: bool) -> dict:
        row = self._touch(_today())
        row.reset_water = bool(done)
        return self._out(self.repo.save(row))

    # ── CLEAR YOUR MIND ───────────────────────────────────────────────
    def set_journal(self, text: str) -> dict:
        row = self._touch(_today())
        row.journal_text = text.strip()
        return self._out(self.repo.save(row))

    def set_journal_action_needed(self, needed: bool) -> dict:
        """True = "make it an action" (caller then follows up with
        set_first_move once they've accepted/edited a suggestion);
        False = "release & return"."""
        row = self._touch(_today())
        row.journal_action_needed = bool(needed)
        row.journal_released = not needed
        return self._out(self.repo.save(row))

    # ── MORNING PRIME ─────────────────────────────────────────────────
    def mark_prime_meditation(self) -> dict:
        row = self._touch(_today())
        row.prime_meditation = True
        return self._out(self.repo.save(row))

    def mark_prime_visualization(self) -> dict:
        row = self._touch(_today())
        row.prime_visualization = True
        return self._out(self.repo.save(row))

    def mark_prime_reading(self) -> dict:
        row = self._touch(_today())
        row.prime_reading = True
        return self._out(self.repo.save(row))

    def set_prime_gratitude(self, text: str) -> dict:
        row = self._touch(_today())
        row.prime_gratitude = text.strip()
        return self._out(self.repo.save(row))

    def set_prime_intention(self, value: str | None) -> dict:
        row = self._touch(_today())
        if value is not None and value not in INTENTION_VALUES:
            raise ValueError(f"invalid prime_intention: {value!r}")
        row.prime_intention = value
        return self._out(self.repo.save(row))

    def set_prime_spiritual(self, value: str) -> dict:
        row = self._touch(_today())
        if value not in SPIRITUAL_VALUES:
            raise ValueError(f"invalid prime_spiritual: {value!r}")
        row.prime_spiritual = value
        return self._out(self.repo.save(row))

    # ── START NOW ─────────────────────────────────────────────────────
    def start_now(self) -> dict:
        """Idempotent, matching every other daily-completion concept in
        this app: the first click stamps started_first_action_at (the
        KPI's other end) and completed_at; a repeated click changes
        nothing, so re-opening an already-started day never resets the
        KPI it's meant to measure."""
        row = self._touch(_today())
        if row.started_first_action_at is None:
            row.started_first_action_at = _now()
            row.completed = True
            row.completed_at = row.started_first_action_at
        return self._out(self.repo.save(row))

    # ── Trend / history ──────────────────────────────────────────────
    def trend(self, year: int | None = None, month: int | None = None) -> dict:
        """Calendar month, day 1 through the month's last day (Zahid,
        2026-09-18: wanted "full september next full october" instead of
        a rolling 30-day window that cut Sep 18 back to Aug 20). Days
        after today in the current month simply have no row yet and plot
        as gaps, same as any other unlogged day."""
        today = date.today()
        year = year or today.year
        month = month or today.month
        days_in_month = calendar.monthrange(year, month)[1]
        day_list = [str(date(year, month, d)) for d in range(1, days_in_month + 1)]
        rows = self.repo.get_range(day_list)
        completed = [bool(rows[d].completed) if d in rows else False for d in day_list]
        energy = [rows[d].energy if d in rows else None for d in day_list]
        mood = [rows[d].mood if d in rows else None for d in day_list]
        sleep_quality = [rows[d].sleep_quality if d in rows else None for d in day_list]
        morning_mode = [rows[d].morning_mode if d in rows else None for d in day_list]
        # Wake-up time / sleep, newest first, nights with neither a close
        # nor a wake skipped — same shape as the journal list below
        # (Zahid, 2026-09-18: wanted sleep quality and wake-up time
        # tracked on the History page).
        #
        # Keyed by the NIGHT CLOSURE's own day, not the wake day (Zahid,
        # 2026-09-19: closing tonight showed nothing on this list until
        # tomorrow's wake time existed — pairing backward from the wake
        # day meant nothing to look up yet). A closure with no wake time
        # yet shows on its own, same night it was pressed, and upgrades
        # in place the next time trend() runs after that morning's wake
        # time is set — nothing is stored twice, this just recomputes
        # from both tables on every call. Bare wake-only days (no
        # closure logged that night, e.g. before this feature existed)
        # still show, keyed by their own day, in a second pass.
        closures = self.night_closure_repo.get_range(day_list) if self.night_closure_repo else {}
        trailing_day = str(date.fromisoformat(day_list[-1]) + timedelta(days=1))
        next_day_rows = dict(rows)
        if trailing_day not in next_day_rows:
            trailing_row = self.repo.get(trailing_day)
            if trailing_row is not None:
                next_day_rows[trailing_day] = trailing_row

        sleep_text: dict[str, str] = {}
        wake_covered_by_closure: set[str] = set()
        for d in day_list:
            close = closures.get(d)
            if close is None or not close.close_time:
                continue
            next_day = str(date.fromisoformat(d) + timedelta(days=1))
            next_row = next_day_rows.get(next_day)
            wake = next_row.wake_up_time if next_row else None
            wake_day = next_day
            if not wake:
                # Closed after midnight — "tonight's" closure and
                # "this morning's" wake share the same calendar day
                # string (Zahid, 2026-09-19: closed 3:49 AM, woke 10:47
                # AM, both dated the 19th — the next-day lookup above
                # never finds this wake, which used to hide it behind
                # a permanent "waiting on tomorrow" placeholder).
                same_row = rows.get(d)
                if same_row and same_row.wake_up_time:
                    wake = same_row.wake_up_time
                    wake_day = d
            if wake:
                wake_covered_by_closure.add(wake_day)
                duration = _sleep_duration(close.close_time, wake)
                text = f"Closed {_fmt_12h(close.close_time)} → Woke {_fmt_12h(wake)}"
                if duration:
                    text += f" · slept {duration}"
            else:
                text = f"Closed {_fmt_12h(close.close_time)} — waiting on tomorrow's wake time"
            sleep_text[d] = text
        for d in day_list:
            if d in sleep_text or d in wake_covered_by_closure:
                continue
            if d in rows and rows[d].wake_up_time:
                sleep_text[d] = f"Woke {_fmt_12h(rows[d].wake_up_time)}"

        wake_up_time = [
            {"day": d, "label": date.fromisoformat(d).strftime("%a %d"), "text": sleep_text[d]}
            for d in reversed(day_list)
            if d in sleep_text
        ]
        # "Clear Your Mind" journal entries, newest first, blank days
        # skipped — same shape and the same reason as Mindset's own
        # history (engine/mindset.py): a run of blank rows reads as a
        # broken widget, not as "nothing written that day". No separate
        # column needed — journal_text already lives on this same
        # per-day row (Zahid, 2026-09-18: wanted these readable back on
        # the History page, "mindset er moto hoile o kharap hoy na").
        journal = [
            {
                "day": d,
                "label": date.fromisoformat(d).strftime("%a %d"),
                "text": rows[d].journal_text,
            }
            for d in reversed(day_list)
            if d in rows and (rows[d].journal_text or "").strip()
        ]
        return {
            "year": year,
            "month": month,
            "days": day_list,
            "completed": completed,
            "energy": energy,
            "mood": mood,
            "sleep_quality": sleep_quality,
            "morning_mode": morning_mode,
            "streak": self._streak(),
            "journal": journal,
            "wake_up_time": wake_up_time,
        }

    def _streak(self) -> int:
        streak = 0
        d = date.today()
        while True:
            row = self.repo.get(str(d))
            if row is None or not row.completed:
                break
            streak += 1
            d -= timedelta(days=1)
        return streak

    @staticmethod
    def _out(row: MorningRitual) -> dict:
        kpi_seconds = None
        if row.started_at is not None and row.started_first_action_at is not None:
            kpi_seconds = max(0.0, row.started_first_action_at - row.started_at)
        return {
            "day": row.day,
            "today_outcome": row.today_outcome,
            "first_move": row.first_move,
            "carried_from_date": row.carried_from_date,
            "energy": row.energy,
            "mood": row.mood,
            "sleep_quality": row.sleep_quality,
            "wake_up_time": row.wake_up_time,
            "morning_mode": row.morning_mode,
            "reset_breathe": row.reset_breathe,
            "reset_move": row.reset_move,
            "reset_daylight": row.reset_daylight,
            "reset_water": row.reset_water,
            "journal_text": row.journal_text,
            "journal_action_needed": row.journal_action_needed,
            "journal_released": row.journal_released,
            "prime_meditation": row.prime_meditation,
            "prime_visualization": row.prime_visualization,
            "prime_reading": row.prime_reading,
            "prime_gratitude": row.prime_gratitude,
            "prime_intention": row.prime_intention,
            "prime_spiritual": row.prime_spiritual,
            "completed": row.completed,
            "started_at": row.started_at,
            "started_first_action_at": row.started_first_action_at,
            "completed_at": row.completed_at,
            "kpi_seconds": kpi_seconds,
        }

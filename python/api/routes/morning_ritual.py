from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    MorningRitualCheckIn,
    MorningRitualFirstMoveSet,
    MorningRitualGratitudeSet,
    MorningRitualIntentionSet,
    MorningRitualJournalAction,
    MorningRitualJournalSet,
    MorningRitualOut,
    MorningRitualOutcomeSet,
    MorningRitualSpiritualSet,
    MorningRitualSuggestIn,
    MorningRitualSuggestOut,
    MorningRitualToggle,
    MorningRitualTrendOut,
)
from database.connection import get_db
from database.repository import MorningRitualRepository, NightClosureRepository
from engine.morning_ritual import MorningRitualEngine, suggest_action

router = APIRouter(prefix="/api/morning-ritual", tags=["morning-ritual"])


def get_engine(db: Session = Depends(get_db)) -> MorningRitualEngine:
    return MorningRitualEngine(MorningRitualRepository(db), NightClosureRepository(db))


def _wrap(fn, *args):
    """Turns the engine's ValueError (an invalid categorical value) into
    a 422 instead of a 500 — the engine validates because it's also the
    natural place to keep the allowed-value lists, not because this
    route wants to catch exceptions generically."""
    try:
        return fn(*args)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/today", response_model=MorningRitualOut)
def read_today(engine: MorningRitualEngine = Depends(get_engine)):
    return engine.get_today()


# ── SEE ──────────────────────────────────────────────────────────────
@router.post("/outcome", response_model=MorningRitualOut)
def set_outcome(payload: MorningRitualOutcomeSet, engine: MorningRitualEngine = Depends(get_engine)):
    return engine.set_outcome(payload.text)


@router.post("/first-move", response_model=MorningRitualOut)
def set_first_move(payload: MorningRitualFirstMoveSet, engine: MorningRitualEngine = Depends(get_engine)):
    return engine.set_first_move(payload.text)


# ── CHECK-IN ─────────────────────────────────────────────────────────
@router.post("/check-in", response_model=MorningRitualOut)
def set_check_in(payload: MorningRitualCheckIn, engine: MorningRitualEngine = Depends(get_engine)):
    return _wrap(engine.set_checkin, payload.energy, payload.mood, payload.sleep_quality, payload.wake_up_time)


# ── RESET ────────────────────────────────────────────────────────────
@router.post("/reset/breathe", response_model=MorningRitualOut)
def mark_breathe_done(engine: MorningRitualEngine = Depends(get_engine)):
    return engine.mark_breathe_done()


@router.post("/reset/move", response_model=MorningRitualOut)
def set_reset_move(payload: MorningRitualToggle, engine: MorningRitualEngine = Depends(get_engine)):
    return engine.set_reset_move(payload.done)


@router.post("/reset/daylight", response_model=MorningRitualOut)
def set_reset_daylight(payload: MorningRitualToggle, engine: MorningRitualEngine = Depends(get_engine)):
    return engine.set_reset_daylight(payload.done)


@router.post("/reset/water", response_model=MorningRitualOut)
def set_reset_water(payload: MorningRitualToggle, engine: MorningRitualEngine = Depends(get_engine)):
    return engine.set_reset_water(payload.done)


# ── CLEAR YOUR MIND ──────────────────────────────────────────────────
@router.post("/journal", response_model=MorningRitualOut)
def set_journal(payload: MorningRitualJournalSet, engine: MorningRitualEngine = Depends(get_engine)):
    return engine.set_journal(payload.text)


@router.post("/journal/action-needed", response_model=MorningRitualOut)
def set_journal_action_needed(payload: MorningRitualJournalAction, engine: MorningRitualEngine = Depends(get_engine)):
    return engine.set_journal_action_needed(payload.needed)


@router.post("/suggest-action", response_model=MorningRitualSuggestOut)
def suggest(payload: MorningRitualSuggestIn):
    """Heuristic only, not a real AI call — see engine.morning_ritual's
    module docstring for why (Zahid's own choice this round)."""
    return {"suggestion": suggest_action(payload.text)}


# ── MORNING PRIME ────────────────────────────────────────────────────
@router.post("/prime/meditation", response_model=MorningRitualOut)
def mark_prime_meditation(engine: MorningRitualEngine = Depends(get_engine)):
    return engine.mark_prime_meditation()


@router.post("/prime/visualization", response_model=MorningRitualOut)
def mark_prime_visualization(engine: MorningRitualEngine = Depends(get_engine)):
    return engine.mark_prime_visualization()


@router.post("/prime/reading", response_model=MorningRitualOut)
def mark_prime_reading(engine: MorningRitualEngine = Depends(get_engine)):
    return engine.mark_prime_reading()


@router.post("/prime/gratitude", response_model=MorningRitualOut)
def set_prime_gratitude(payload: MorningRitualGratitudeSet, engine: MorningRitualEngine = Depends(get_engine)):
    return engine.set_prime_gratitude(payload.text)


@router.post("/prime/intention", response_model=MorningRitualOut)
def set_prime_intention(payload: MorningRitualIntentionSet, engine: MorningRitualEngine = Depends(get_engine)):
    return _wrap(engine.set_prime_intention, payload.value)


@router.post("/prime/spiritual", response_model=MorningRitualOut)
def set_prime_spiritual(payload: MorningRitualSpiritualSet, engine: MorningRitualEngine = Depends(get_engine)):
    return _wrap(engine.set_prime_spiritual, payload.value)


# ── START NOW ────────────────────────────────────────────────────────
@router.post("/start-now", response_model=MorningRitualOut)
def start_now(engine: MorningRitualEngine = Depends(get_engine)):
    return engine.start_now()


# ── Trend / history ──────────────────────────────────────────────────
@router.get("/trend", response_model=MorningRitualTrendOut)
def trend(year: int | None = None, month: int | None = None, engine: MorningRitualEngine = Depends(get_engine)):
    return engine.trend(year, month)

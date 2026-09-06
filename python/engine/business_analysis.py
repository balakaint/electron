from datetime import date

from database.models import BusinessAnalysis, DecisionLog
from database.repository import BusinessAnalysisRepository

_LOG_CAP = 40  # matches the legacy app's `_log[-40:]`

_TEXT_FIELDS = (
    "idea_business", "idea_problem", "idea_customer", "idea_goal",
    "an_market", "an_competition", "an_strength", "an_risk",
    "fin_investment", "fin_cost", "fin_revenue", "fin_profit",
    "decision_why", "next_action", "next_deadline",
)


class BusinessAnalysisEngine:
    def __init__(self, repo: BusinessAnalysisRepository):
        self.repo = repo

    def get(self, project_key: str) -> BusinessAnalysis | None:
        return self.repo.get(project_key)

    def update(self, project_key: str, **fields) -> BusinessAnalysis | None:
        ba = self.repo.get(project_key)
        if ba is None:
            return None
        for key, value in fields.items():
            if key in _TEXT_FIELDS and value is not None:
                setattr(ba, key, value)
        return self.repo.save(ba)

    def set_decision_status(self, project_key: str, status: str) -> BusinessAnalysis | None:
        """Matches the legacy segmented control exactly: clicking the
        already-active option clears it back to "", and every real
        change is auto-logged using whatever's currently in decision_why
        — never a separate prompt, so the log can't go stale or empty."""
        ba = self.repo.get(project_key)
        if ba is None:
            return None
        was = ba.decision_status
        now = "" if was == status else status
        ba.decision_status = now
        if now != was:
            self.repo.add_log_entry(DecisionLog(
                project_key=project_key,
                date=str(date.today()),
                from_status=was or "—",
                to_status=now or "—",
                why=(ba.decision_why or "").strip(),
            ))
            self.repo.trim_log(project_key, _LOG_CAP)
        return self.repo.save(ba)

    def set_priority(self, project_key: str, priority: str) -> BusinessAnalysis | None:
        """Same toggle-off-if-same-value behavior as decision status,
        but never logged — only decision_status has history in the
        legacy app."""
        ba = self.repo.get(project_key)
        if ba is None:
            return None
        ba.next_priority = "" if ba.next_priority == priority else priority
        return self.repo.save(ba)

    def get_log(self, project_key: str) -> list[DecisionLog]:
        return self.repo.list_log(project_key)

    def get_legacy_boxes(self, project_key: str) -> list:
        return self.repo.list_legacy_boxes(project_key)

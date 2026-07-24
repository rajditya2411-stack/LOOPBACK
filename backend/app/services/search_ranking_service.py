"""Shared, normalized relevance scoring for the unified workspace search."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone


# These weights intentionally live together so every search resource remains comparable.
RANKING_WEIGHTS = {
    "semantic": 0.34,
    "keyword": 0.25,
    "exact_title": 0.12,
    "phrase": 0.08,
    "recency": 0.07,
    "importance": 0.06,
    "confidence": 0.04,
    "pinned": 0.025,
    "usage": 0.015,
}
RECENCY_HALF_LIFE_DAYS = 90.0
USAGE_SATURATION = 10
CANDIDATE_MULTIPLIER = 3
PRIORITY_IMPORTANCE = {"urgent": 1.0, "high": 0.8, "medium": 0.5, "low": 0.2}
ACTIVE_GOAL_WITH_TARGET_IMPORTANCE = 0.8
ACTIVE_GOAL_IMPORTANCE = 0.45
INACTIVE_GOAL_IMPORTANCE = 0.1


@dataclass(frozen=True)
class SearchSignals:
    keyword: float = 0.0
    semantic: float = 0.0
    exact_title: float = 0.0
    phrase: float = 0.0
    recency: float = 0.0
    importance: float = 0.0
    confidence: float = 0.0
    pinned: float = 0.0
    usage: float = 0.0


def query_terms(query: str) -> list[str]:
    return [term for term in re.findall(r"\w+", query.lower()) if term][:12]


def _clamp(value: float) -> float:
    return max(0.0, min(float(value), 1.0))


def keyword_relevance(text: str, terms: list[str]) -> float:
    """Reward term coverage while allowing repeated meaningful matches to help."""
    lowered = text.lower()
    if not terms:
        return 0.0
    return _clamp(sum(lowered.count(term) for term in terms) / len(terms))


def text_signals(query: str, title: str, content: str, *, semantic: float = 0.0) -> SearchSignals:
    normalized_query = " ".join(query.lower().split())
    normalized_title = " ".join(title.lower().split())
    haystack = f"{title} {content}".strip()
    return SearchSignals(
        keyword=keyword_relevance(haystack, query_terms(query)),
        semantic=_clamp(semantic),
        exact_title=1.0 if normalized_query and normalized_query == normalized_title else 0.0,
        phrase=1.0 if normalized_query and normalized_query in haystack.lower() else 0.0,
    )


def recency_relevance(value: datetime | None, *, now: datetime | None = None) -> float:
    if value is None:
        return 0.0
    now = now or datetime.now(timezone.utc)
    timestamp = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    age_days = max(0.0, (now - timestamp).total_seconds() / 86_400)
    return _clamp(math.exp(-math.log(2) * age_days / RECENCY_HALF_LIFE_DAYS))


def relevance_score(signals: SearchSignals) -> float:
    return round(sum(getattr(signals, name) * weight for name, weight in RANKING_WEIGHTS.items()), 4)


def task_importance(priority: str) -> float:
    return PRIORITY_IMPORTANCE.get(priority, 0.0)


def goal_importance(status: str, has_target_date: bool) -> float:
    if status != "active":
        return INACTIVE_GOAL_IMPORTANCE
    return ACTIVE_GOAL_WITH_TARGET_IMPORTANCE if has_target_date else ACTIVE_GOAL_IMPORTANCE


def with_metadata(
    signals: SearchSignals,
    *,
    updated_at: datetime | None = None,
    importance: float = 0.0,
    confidence: float = 0.0,
    pinned: bool = False,
    usage_count: int = 0,
) -> SearchSignals:
    return SearchSignals(
        keyword=signals.keyword,
        semantic=signals.semantic,
        exact_title=signals.exact_title,
        phrase=signals.phrase,
        recency=recency_relevance(updated_at),
        importance=_clamp(importance),
        confidence=_clamp(confidence),
        pinned=1.0 if pinned else 0.0,
        usage=_clamp(usage_count / USAGE_SATURATION),
    )

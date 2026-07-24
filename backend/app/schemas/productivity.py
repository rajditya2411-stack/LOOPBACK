"""Schemas for proactive workspace planning and analytics."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TodayTask(BaseModel):
    id: str
    title: str
    priority: str
    status: str
    due_date: datetime | None = None
    is_overdue: bool = False


class TodayGoal(BaseModel):
    id: str
    title: str
    progress: float
    target_date: datetime | None = None


class TodayMemory(BaseModel):
    id: str
    content: str
    category: str
    is_pinned: bool


class Recommendation(BaseModel):
    title: str
    detail: str
    action_url: str
    priority: Literal["high", "medium", "low"] = "medium"


class TodayWorkspace(BaseModel):
    focus_summary: str
    important_tasks: list[TodayTask]
    goal_progress: list[TodayGoal]
    recent_memories: list[TodayMemory]
    recommendations: list[Recommendation]
    work_patterns: list[str]


class DailyCompletion(BaseModel):
    date: str
    completed: int


class ProductiveHour(BaseModel):
    hour: int
    completed: int
    activity_count: int
    confidence: Literal["low", "medium", "high"]


class InsightEvidence(BaseModel):
    """A small, user-readable fact supporting a behavioral conclusion."""

    label: str
    detail: str
    action_url: str = "/analytics"


class BehavioralInsight(BaseModel):
    """An explainable finding derived from the user's recorded workspace activity."""

    id: str
    title: str
    detail: str
    priority: Literal["high", "medium", "low"] = "medium"
    evidence: list[InsightEvidence] = Field(default_factory=list, max_length=3)


class AnalyticsTrend(BaseModel):
    """A multi-week direction, deliberately omitted when the evidence is too thin."""

    label: str
    direction: Literal["improving", "declining", "stable", "insufficient"]
    detail: str


class WeeklyAnalytics(BaseModel):
    period_start: str
    period_end: str
    completed_this_week: int
    completed_previous_week: int
    completion_change: float | None = None
    daily_completions: list[DailyCompletion]
    productive_hours: list[ProductiveHour]
    overdue_tasks: int
    stale_tasks: int
    tasks_without_deadlines: int
    goals_without_deadlines: int
    weekly_summary: str
    recommendations: list[Recommendation]
    productive_hours_confidence: Literal["low", "medium", "high"]
    behavioral_insights: list[BehavioralInsight]
    trends: list[AnalyticsTrend]
    data_coverage: str


class ProductivityActionRequest(BaseModel):
    action: Literal[
        "review_week",
        "summarize_documents",
        "create_tasks_from_documents",
        "analyze_progress",
        "forgotten_goals",
        "suggest_next_actions",
    ]


class TaskSuggestion(BaseModel):
    title: str = Field(max_length=255)
    description: str | None = None
    priority: Literal["low", "medium", "high", "urgent"] = "medium"


class ProductivityActionResult(BaseModel):
    action: str
    title: str
    content: str
    task_suggestions: list[TaskSuggestion] = []

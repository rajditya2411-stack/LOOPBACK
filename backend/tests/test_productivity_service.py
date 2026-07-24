"""Tests for proactive planning and analytics calculations."""

import logging
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api import productivity as productivity_api
from app.core.deps import get_current_user
from app.database.session import get_db
from app.main import app
from app.services import productivity_service


def task(**overrides: object) -> SimpleNamespace:
    now = datetime.now(timezone.utc)
    values: dict[str, object] = {
        "id": "task", "title": "Task", "status": "todo", "priority": "medium",
        "due_date": None, "updated_at": now, "completed_at": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def goal(**overrides: object) -> SimpleNamespace:
    values: dict[str, object] = {"id": "goal", "title": "Goal", "status": "active", "target_date": None}
    values.update(overrides)
    return SimpleNamespace(**values)


def test_recommendations_prioritize_overdue_work() -> None:
    today = datetime.now(timezone.utc).date()
    recommendations = productivity_service._recommendations(
        [task(due_date=datetime.now(timezone.utc) - timedelta(days=1))], [goal()], today
    )

    assert recommendations[0].priority == "high"
    assert "overdue" in recommendations[0].title.lower()
    assert any(item.action_url == "/goals" for item in recommendations)


@pytest.mark.asyncio
async def test_weekly_analytics_groups_completion_days_and_hours() -> None:
    now = datetime.now(timezone.utc)
    monday = now.date() - timedelta(days=now.weekday())
    completed_at = datetime.combine(monday, datetime.min.time(), tzinfo=timezone.utc).replace(hour=10)
    # Keep non-completion activity outside the 28-day analytics window so this
    # assertion is independent of the hour when the test suite runs.
    inactive_at = now - timedelta(days=30)
    completed = task(id="done", status="done", completed_at=completed_at, updated_at=inactive_at)
    open_task = task(id="open", due_date=now - timedelta(days=1), updated_at=inactive_at)

    class Scalars:
        def __init__(self, values: list[object]) -> None:
            self.values = values

        def all(self) -> list[object]:
            return self.values

    class Db:
        def __init__(self) -> None:
            self.calls = 0

        async def scalars(self, _query: object) -> Scalars:
            self.calls += 1
            if self.calls == 1:
                return Scalars([completed, open_task])
            if self.calls == 2:
                return Scalars([goal()])
            return Scalars([])

    analytics = await productivity_service.build_weekly_analytics(Db(), "user-1")

    assert analytics.completed_this_week == 1
    assert sum(day.completed for day in analytics.daily_completions) == 1
    hour = next(entry for entry in analytics.productive_hours if entry.hour == 10)
    assert hour.completed == 1
    assert hour.activity_count == 3
    assert hour.confidence == "low"
    assert analytics.overdue_tasks == 1
    assert analytics.stale_tasks == 1
    assert any(insight.id == "overdue-work" for insight in analytics.behavioral_insights)


@pytest.mark.asyncio
async def test_ai_today_response_uses_only_supported_navigation(monkeypatch: pytest.MonkeyPatch) -> None:
    async def response(_: str, __: str, **kwargs: object) -> str:
        return """{
          "focus_summary": "Finish the overdue migration before starting lower-priority work.",
          "recommendations": [{
            "title": "Finish the migration",
            "detail": "It is the only supplied overdue task and blocks the current release.",
            "action_url": "/tasks",
            "priority": "high"
          }],
          "work_patterns": ["One supplied task is past due."]
        }"""

    monkeypatch.setattr(productivity_service, "_ask_productivity_ai", response)

    plan = await productivity_service._ai_today_response("[Task] Finish migration; overdue")

    assert plan is not None
    assert plan.recommendations[0].action_url == "/tasks"
    assert "overdue" in plan.focus_summary.lower()


@pytest.mark.asyncio
async def test_ai_today_response_rejects_unsupported_navigation(monkeypatch: pytest.MonkeyPatch) -> None:
    async def response(_: str, __: str, **kwargs: object) -> str:
        return """{
          "focus_summary": "Do the supplied task first today.",
          "recommendations": [{
            "title": "Do the task",
            "detail": "The workspace lists it as urgent.",
            "action_url": "https://untrusted.example",
            "priority": "high"
          }],
          "work_patterns": []
        }"""

    monkeypatch.setattr(productivity_service, "_ask_productivity_ai", response)

    assert await productivity_service._ai_today_response("[Task] urgent") is None


@pytest.mark.asyncio
async def test_productivity_ai_timeout_returns_none_for_local_fallback(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    class TimeoutProvider:
        async def complete_text(self, _messages: object) -> str:
            raise productivity_service.AIProviderError("provider timed out")

    monkeypatch.setattr(productivity_service, "get_ai_provider", lambda: TimeoutProvider())
    caplog.set_level(logging.WARNING)

    assert await productivity_service._ask_productivity_ai("system", "request") is None
    assert "timed out" in caplog.text


@pytest.mark.asyncio
async def test_today_workspace_keeps_local_plan_when_ai_times_out(monkeypatch: pytest.MonkeyPatch) -> None:
    due_yesterday = datetime.now(timezone.utc) - timedelta(days=1)

    class Scalars:
        def __init__(self, values: list[object]) -> None:
            self.values = values

        def all(self) -> list[object]:
            return self.values

    class Db:
        def __init__(self) -> None:
            self.calls = 0

        async def scalars(self, _query: object) -> Scalars:
            self.calls += 1
            if self.calls == 1:
                return Scalars([task(id="overdue", title="Ship dashboard fix", priority="high", due_date=due_yesterday)])
            return Scalars([])

    async def enabled(*args: object, **kwargs: object) -> bool:
        return True

    async def context(*args: object, **kwargs: object) -> productivity_service._ProductivityContext:
        return productivity_service._ProductivityContext(content="[Task] Ship dashboard fix", recent_memories=[])

    class TimeoutClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        async def __aenter__(self) -> "TimeoutClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(self, *args: object, **kwargs: object) -> object:
            raise productivity_service.httpx.ReadTimeout("provider timed out")

    monkeypatch.setattr(productivity_service, "_ai_suggestions_enabled", enabled)
    monkeypatch.setattr(productivity_service, "_productivity_context", context)
    monkeypatch.setattr(productivity_service.httpx, "AsyncClient", TimeoutClient)

    plan = await productivity_service.build_today_workspace(Db(), "user-1")

    assert plan.focus_summary.startswith("Start by resolving 1 overdue task")
    assert plan.important_tasks[0].title == "Ship dashboard fix"
    assert plan.recommendations[0].priority == "high"


def test_productivity_exceptions_return_json_with_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing_today_workspace(*args: object, **kwargs: object) -> None:
        raise RuntimeError("boom")

    monkeypatch.setattr(productivity_api, "build_today_workspace", failing_today_workspace)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="user-1")
    app.dependency_overrides[get_db] = lambda: object()

    try:
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/api/productivity/today", headers={"Origin": "http://localhost:3000"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.json()["detail"] == "Internal server error"


@pytest.mark.asyncio
async def test_document_task_action_requires_structured_actionable_suggestions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def response(_: str, __: str, **kwargs: object) -> str:
        return """{
          "content": "The document contains one implementation follow-up.",
          "task_suggestions": [{
            "title": "Implement the migration endpoint",
            "description": "The document lists it as a release requirement.",
            "priority": "high"
          }]
        }"""

    monkeypatch.setattr(productivity_service, "_ask_productivity_ai", response)

    result = await productivity_service._ai_action_response(
        "create_tasks_from_documents", "[Document] migration endpoint is required"
    )

    assert result is not None
    assert result.task_suggestions[0].title == "Implement the migration endpoint"


@pytest.mark.asyncio
async def test_ai_suggestions_require_provider_and_user_preference(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Db:
        calls = 0

        async def scalar(self, _: object) -> bool:
            self.calls += 1
            return False

    db = Db()
    monkeypatch.setattr(
        type(productivity_service.settings), "ai_provider_configured", property(lambda _: False),
    )
    assert not await productivity_service._ai_suggestions_enabled(db, "user-1")
    assert db.calls == 0

    monkeypatch.setattr(
        type(productivity_service.settings), "ai_provider_configured", property(lambda _: True),
    )
    assert not await productivity_service._ai_suggestions_enabled(db, "user-1")
    assert db.calls == 1

    class EnabledDb:
        async def scalar(self, _: object) -> bool:
            return True

    assert await productivity_service._ai_suggestions_enabled(EnabledDb(), "user-1")


def test_behavioral_signals_explain_intake_without_claiming_a_cause() -> None:
    now = datetime.now(timezone.utc)
    tasks = [
        task(id=str(index), created_at=now - timedelta(days=index), updated_at=now)
        for index in range(4)
    ]

    insights = productivity_service._behavioral_insights(tasks, [goal()], now.date(), [])

    intake = next(item for item in insights if item.id == "intake-outpacing-completion")
    assert "not proof of procrastination" in intake.detail
    assert intake.evidence[0].action_url == "/tasks"


def test_multiweek_trends_require_history_before_declaring_direction() -> None:
    now = datetime.now(timezone.utc)
    start = now.date() - timedelta(days=now.weekday())

    insufficient = productivity_service._multiweek_trends([], start)
    assert insufficient[0].direction == "insufficient"

    completed = [
        task(id="current", status="done", completed_at=datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)),
        task(id="previous", status="done", completed_at=datetime.combine(start - timedelta(days=7), datetime.min.time(), tzinfo=timezone.utc)),
    ]
    trend = productivity_service._multiweek_trends(completed, start)
    assert trend[0].direction == "stable"


@pytest.mark.asyncio
async def test_ai_weekly_response_rejects_unsupported_navigation(monkeypatch: pytest.MonkeyPatch) -> None:
    async def response(_: str, __: str, **kwargs: object) -> str:
        return '''{"weekly_summary":"Measured work needs a review.","recommendations":[{"title":"Review work","detail":"The supplied data identifies overdue work.","action_url":"https://untrusted.example","priority":"high"}]}'''

    monkeypatch.setattr(productivity_service, "_ask_productivity_ai", response)
    analytics = productivity_service.WeeklyAnalytics(
        period_start="2026-07-13", period_end="2026-07-19", completed_this_week=0,
        completed_previous_week=0, daily_completions=[], productive_hours=[], overdue_tasks=0,
        stale_tasks=0, tasks_without_deadlines=0, goals_without_deadlines=0,
        weekly_summary="No completed tasks.", recommendations=[], productive_hours_confidence="low",
        behavioral_insights=[], trends=[], data_coverage="No activity.",
    )

    assert await productivity_service._ai_weekly_response("[Workspace] no data", analytics) is None

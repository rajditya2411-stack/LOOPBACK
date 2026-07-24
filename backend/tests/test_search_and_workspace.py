"""Tests for unified-search ranking and workspace authorization boundaries."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import search, workspaces
from app.services.search_ranking_service import SearchSignals, relevance_score, text_signals, with_metadata


def test_keyword_score_rewards_multiple_matching_terms() -> None:
    assert search._keyword_score("Plan a Python backend", ["python", "backend"]) == 1.0
    assert search._keyword_score("Plan a Python backend", ["python", "missing"]) == 0.5
    assert search._keyword_score("Plan a Python backend", ["missing"]) == 0.0


def test_shared_ranking_rewards_exact_titles_and_semantic_matches() -> None:
    exact = relevance_score(with_metadata(text_signals("release plan", "Release plan", "", semantic=0.0)))
    partial = relevance_score(with_metadata(text_signals("release plan", "Release notes", "planning details", semantic=0.0)))
    semantic = relevance_score(SearchSignals(semantic=0.9))

    assert exact > partial
    assert semantic > 0


@pytest.mark.asyncio
async def test_workspace_role_guard_blocks_viewer_from_editing() -> None:
    class Db:
        async def scalar(self, _query: object) -> object:
            return SimpleNamespace(role="viewer")

    member = await workspaces._member_or_error(Db(), "workspace-1", "user-1")
    assert member.role == "viewer"
    with pytest.raises(HTTPException) as error:
        await workspaces._member_or_error(Db(), "workspace-1", "user-1", "editor")
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_workspace_role_guard_blocks_non_members() -> None:
    class Db:
        async def scalar(self, _query: object) -> None:
            return None

    with pytest.raises(HTTPException) as error:
        await workspaces._member_or_error(Db(), "workspace-1", "user-1")
    assert error.value.status_code == 403

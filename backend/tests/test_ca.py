"""
Unit tests for Chartered Accountant domain endpoints (/api/ca).
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.deps import get_current_user
from app.models.user import User


mock_ca_user = User(
    id="user-ca-test-1",
    email="partner@taxfirm.com",
    full_name="Senior CA Partner",
    is_active=True,
)


@pytest.fixture(autouse=True)
def override_user():
    app.dependency_overrides[get_current_user] = lambda: mock_ca_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_caro_checklist_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/ca/checklists/caro2020")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) == 21
        assert any(item["clause"] == "(i)" for item in data)
        assert any(item["clause"] == "(xix)" for item in data)


@pytest.mark.asyncio
async def test_form3cd_checklist_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/ca/checklists/form3cd")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert any("40A(3)" in item["title"] or "40A(3)" in item["description"] for item in data)
        assert any("43B(h)" in item["title"] for item in data)


@pytest.mark.asyncio
async def test_schedule_iii_ratios_calculation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "ratios": [
                {
                    "name": "Current Ratio",
                    "current_year": 2.1,
                    "previous_year": 1.5,
                    "unit": "ratio",
                },
                {
                    "name": "Debt-Equity Ratio",
                    "current_year": 0.85,
                    "previous_year": 0.82,
                    "unit": "ratio",
                },
            ]
        }
        res = await client.post("/api/ca/financials/ratios", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 2

        # Current ratio: (2.1 - 1.5)/1.5 = 40% variance -> triggers statutory disclosure note
        curr_ratio = next(r for r in data if r["name"] == "Current Ratio")
        assert curr_ratio["is_statutory_variance"] is True
        assert curr_ratio["variance_percentage"] == 40.0
        assert "Schedule III" in curr_ratio["suggested_note"]

        # Debt-Equity: (0.85 - 0.82)/0.82 = 3.66% variance -> normal
        de_ratio = next(r for r in data if r["name"] == "Debt-Equity Ratio")
        assert de_ratio["is_statutory_variance"] is False


@pytest.mark.asyncio
async def test_notice_analysis_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "notice_text": "Notice under Section 143(2) of Income Tax Act with DIN: ITBA/AST/S/143(2)/2025-26/1059483921(1) for limited scrutiny regarding demand of tax."
        }
        res = await client.post("/api/ca/notices/analyze", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["din"] == "ITBA/AST/S/143(2)/2025-26/1059483921(1)"
        assert "143(2)" in data["section_invoked"]
        assert len(data["key_legal_defenses"]) > 0


@pytest.mark.asyncio
async def test_compliance_calendar_generation():
    from types import SimpleNamespace
    from app.database.session import get_db

    class MockResult:
        def scalar_one_or_none(self):
            return SimpleNamespace(id="ws-ca-test", name="Apex Test Corp")

        def scalars(self):
            return SimpleNamespace(all=lambda: [SimpleNamespace(id="ws-ca-test", name="Apex Test Corp")])

    class MockDb:
        async def execute(self, *args, **kwargs):
            return MockResult()

        def add(self, obj):
            if not getattr(obj, "id", None):
                obj.id = "mock-id-generated"

        async def commit(self):
            pass

        async def flush(self):
            pass

        async def refresh(self, obj):
            if not getattr(obj, "id", None):
                obj.id = "mock-id-refreshed"

    async def mock_db_generator():
        yield MockDb()

    app.dependency_overrides[get_db] = mock_db_generator
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {
                "workspace_id": "ws-ca-test",
                "entity_name": "Apex Test Corp",
                "entity_type": "Pvt Ltd",
                "gst_registered": True,
                "tds_deductor": True,
                "tax_audit_applicable": True,
            }
            res = await client.post("/api/ca/compliance/generate", json=payload)
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert data["entity_name"] == "Apex Test Corp"
            assert data["goals_created"] > 0
            assert data["tasks_created"] > 0
    finally:
        app.dependency_overrides.pop(get_db, None)

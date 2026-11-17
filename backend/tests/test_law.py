"""
Unit tests for Legal Practice & Law Firm domain endpoints (/api/law).
Tests limitation calculations, precedent searches, cause list tracking,
and litigation schedule generation.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.deps import get_current_user
from app.models.user import User


mock_law_user = User(
    id="user-law-test-1",
    email="counsel@chambers.law",
    full_name="Senior Advocate R. Nariman",
    is_active=True,
)


@pytest.fixture(autouse=True)
def override_user():
    app.dependency_overrides[get_current_user] = lambda: mock_law_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_limitation_categories_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/law/limitation/categories")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) >= 10
        assert any(item["id"] == "lim-contract-debt" for item in data)
        assert any(item["id"] == "lim-commercial-suit" for item in data)
        assert any(item["id"] == "lim-sec34-arbitration" for item in data)


@pytest.mark.asyncio
async def test_limitation_calculation_contract_debt():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "category_id": "lim-contract-debt",
            "cause_of_action_date": "2025-01-01",
            "court_forum": "Civil Court",
        }
        res = await client.post("/api/law/limitation/calculate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["category_id"] == "lim-contract-debt"
        assert data["statutory_limitation_days"] == 1095
        assert data["computed_deadline"] == "2028-01-01"
        assert data["is_barred_by_limitation"] is False
        assert data["condonation_available_under_sec_5"] is False


@pytest.mark.asyncio
async def test_limitation_calculation_with_acknowledgment():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "category_id": "lim-contract-debt",
            "cause_of_action_date": "2023-01-01",
            "acknowledgment_date": "2025-06-01",
        }
        res = await client.post("/api/law/limitation/calculate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["effective_start_date"] == "2025-06-01"
        assert data["computed_deadline"] == "2028-05-31"
        assert data["acknowledgment_valid"] is True


@pytest.mark.asyncio
async def test_limitation_calculation_with_expired_acknowledgment_invalid_sec18():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Cause of action 2018-01-01 -> 3-year limitation expired on 2021-01-01
        # Written acknowledgment on 2023-01-01 was executed after expiration
        payload = {
            "category_id": "lim-contract-debt",
            "cause_of_action_date": "2018-01-01",
            "acknowledgment_date": "2023-01-01",
        }
        res = await client.post("/api/law/limitation/calculate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["acknowledgment_valid"] is False
        assert data["is_barred_by_limitation"] is True
        assert data["urgency_tier"] == "Time-Barred"
        assert "Section 18" in data["action_recommendation"]
        assert "expired" in data["action_recommendation"].lower()


@pytest.mark.asyncio
async def test_limitation_calculation_leap_year():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Testing date spanning Feb 29 2024 leap year
        payload = {
            "category_id": "lim-appeal-district",  # 30 days
            "cause_of_action_date": "2024-02-15",
        }
        res = await client.post("/api/law/limitation/calculate", json=payload)
        assert res.status_code == 200
        data = res.json()
        # Feb 2024 has 29 days: 2024-02-15 + 30 days = 2024-03-16
        assert data["computed_deadline"] == "2024-03-16"


@pytest.mark.asyncio
async def test_limitation_calculation_commercial_suit_and_time_barred():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "category_id": "lim-commercial-suit",
            "cause_of_action_date": "2020-01-01",
            "pre_institution_mediation_days": 45,
        }
        res = await client.post("/api/law/limitation/calculate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["is_barred_by_limitation"] is True
        assert data["urgency_tier"] == "Time-Barred"
        assert data["pre_institution_mediation_days_excluded"] == 45
        assert data["commercial_ws_120_day_deadline"] is not None


@pytest.mark.asyncio
async def test_precedents_search_and_filter():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. All
        res = await client.get("/api/law/precedents")
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 8

        # 2. Filter by practice area
        res_arb = await client.get("/api/law/precedents?practice_area=Arbitration")
        assert res_arb.status_code == 200
        arb_data = res_arb.json()
        assert all("arbitration" in p["practice_area"].lower() for p in arb_data)

        # 3. Query search
        res_q = await client.get("/api/law/precedents?q=Kesavananda")
        assert res_q.status_code == 200
        q_data = res_q.json()
        assert len(q_data) >= 1
        assert "Kesavananda" in q_data[0]["case_name"]


@pytest.mark.asyncio
async def test_precedent_by_id():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/law/precedents/prec-puttaswamy")
        assert res.status_code == 200
        data = res.json()
        assert "Puttaswamy" in data["case_name"]
        assert "Privacy" in data["practice_area"]

        # Not found
        res_404 = await client.get("/api/law/precedents/prec-nonexistent")
        assert res_404.status_code == 404


@pytest.mark.asyncio
async def test_precedent_match():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "facts_or_proposition": "The respondent failed to file written statement within 120 days in commercial suit.",
            "practice_area": "Commercial Litigation"
        }
        res = await client.post("/api/law/precedents/match", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert len(data["matched_precedents"]) > 0
        assert any("SCG" in p["case_name"] for p in data["matched_precedents"])
        assert "binding dictum" in data["suggested_argument_framing"]


@pytest.mark.asyncio
async def test_cause_list_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Get cause list
        res = await client.get("/api/law/causelist")
        assert res.status_code == 200
        items = res.json()
        assert len(items) >= 5

        # Track new matter
        new_matter = {
            "item_number": 42,
            "case_number": "CS(COMM) 777/2026",
            "parties": "Tech Corp v. Innovate Ltd",
            "court_name": "High Court of Delhi",
            "bench": "Hon'ble Justice Pratibha Singh",
            "court_room": "Court Room 24",
            "stage": "Final Arguments",
            "list_type": "Regular",
            "hearing_date": "2026-11-20",
            "session": "11:00 AM",
            "advocate_counsel": "Adv. R. Nariman",
            "notes": "Urgent injunction matter."
        }
        res_track = await client.post("/api/law/causelist/track", json=new_matter)
        assert res_track.status_code == 200
        created = res_track.json()
        assert created["case_number"] == "CS(COMM) 777/2026"

        # Update status
        res_update = await client.put(
            f"/api/law/causelist/{created['id']}/status",
            json={"status": "Passed Over", "notes": "Passed over till 2 PM"}
        )
        assert res_update.status_code == 200
        assert res_update.json()["status"] == "Passed Over"


@pytest.mark.asyncio
async def test_litigation_schedule_generation():
    from types import SimpleNamespace
    from app.database.session import get_db

    class MockResult:
        def scalar_one_or_none(self):
            return SimpleNamespace(id="ws-law-test", name="Apex Logistics v UOI")

        def scalars(self):
            return SimpleNamespace(all=lambda: [SimpleNamespace(id="ws-law-test", name="Apex Logistics v UOI")])

    class MockDb:
        async def execute(self, *args, **kwargs):
            return MockResult()

        def add(self, obj):
            if not getattr(obj, "id", None):
                obj.id = "mock-law-id"

        async def commit(self):
            pass

        async def flush(self):
            pass

        async def refresh(self, obj):
            if not getattr(obj, "id", None):
                obj.id = "mock-law-refreshed"

    async def mock_db_generator():
        yield MockDb()

    app.dependency_overrides[get_db] = mock_db_generator
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {
                "matter_name": "Apex Logistics v Union of India",
                "case_type": "Commercial Suit",
                "court_forum": "Delhi High Court",
                "filing_date": "2026-11-18",
                "client_name": "Apex Logistics Ltd",
                "workspace_id": "ws-law-test"
            }
            res = await client.post("/api/law/cases/generate-schedule", json=payload)
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert data["goals_created"] > 0
            assert data["tasks_created"] > 0
    finally:
        app.dependency_overrides.pop(get_db, None)

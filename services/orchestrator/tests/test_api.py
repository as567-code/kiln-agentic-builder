from __future__ import annotations

import os

os.environ["KILN_ENV"] = "test"
os.environ["KILN_SERVICE_TOKEN"] = "test-service-token"  # noqa: S105
os.environ["KILN_PLANNER_MODE"] = "deterministic"

from fastapi.testclient import TestClient

from kiln_orchestrator.main import app
from kiln_orchestrator.settings import get_settings

get_settings.cache_clear()
client = TestClient(app)
AUTH = {"X-Kiln-Service-Token": "test-service-token"}


def test_health_is_public_and_hardened() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-request-id"].startswith("req_")


def test_private_routes_reject_missing_service_token() -> None:
    response = client.post(
        "/v1/contracts/draft",
        json={
            "project_id": "prj_12345678",
            "brief": "Build an inventory tracker for a small neighborhood bakery.",
        },
    )
    assert response.status_code == 401


def test_drafts_a_typed_inventory_contract() -> None:
    response = client.post(
        "/v1/contracts/draft",
        headers=AUTH,
        json={
            "project_id": "prj_12345678",
            "brief": "Build an inventory tracker for a small neighborhood bakery.",
        },
    )
    assert response.status_code == 200
    contract = response.json()
    assert contract["planner"] == "deterministic-demo-v1"
    assert contract["model"] == "deterministic"
    assert contract["usage"]["total_tokens"] == 0
    assert len(contract["requirements"]) == 4
    assert contract["system_shape"]["entities"][0]["name"] == "Ingredient"
    assert len(contract["clarification_questions"]) <= 3


def test_drafts_a_brief_aware_volunteer_contract() -> None:
    response = client.post(
        "/v1/contracts/draft",
        headers=AUTH,
        json={
            "project_id": "prj_12345678",
            "brief": "Build a volunteer scheduling tool for a neighborhood food pantry.",
        },
    )

    assert response.status_code == 200
    contract = response.json()
    assert contract["title"] == "Volunteer scheduling workspace"
    assert {entity["name"] for entity in contract["system_shape"]["entities"]} == {
        "Volunteer",
        "Shift",
        "Assignment",
    }
    assert contract["system_shape"]["api_operations"][0]["path"] == "/api/shifts"
    assert contract["acceptance_checks"][-1]["kind"] == "accessibility"


def test_rejects_invalid_and_exhausted_transitions() -> None:
    invalid = client.post(
        "/v1/runs/transition",
        headers=AUTH,
        json={
            "run_id": "run_12345678",
            "from_state": "ready",
            "to_state": "build",
            "attempt": 0,
        },
    )
    assert invalid.status_code == 409

    exhausted = client.post(
        "/v1/runs/transition",
        headers=AUTH,
        json={
            "run_id": "run_12345678",
            "from_state": "diagnose",
            "to_state": "repair_patch",
            "attempt": 3,
        },
    )
    assert exhausted.status_code == 409


def test_proposes_a_typed_bounded_patch() -> None:
    response = client.post(
        "/v1/patches/propose",
        headers=AUTH,
        json={
            "run_id": "run_12345678",
            "sequence": 1,
            "stage": "interface",
            "contract": {
                "title": "Volunteer scheduling",
                "summary": "Coordinate volunteer shifts for a neighborhood food pantry.",
                "requirements": [
                    {
                        "id": "req_manage_shifts",
                        "statement": "Create and assign volunteer shifts",
                        "priority": "must",
                    }
                ],
                "system_shape": {
                    "pages": ["Schedule"],
                    "entities": [
                        {
                            "name": "Shift",
                            "fields": [{"name": "starts_at", "type": "datetime", "required": True}],
                        }
                    ],
                    "api_operations": [
                        {"method": "GET", "path": "/api/shifts", "purpose": "List shifts"}
                    ],
                },
                "acceptance_checks": [
                    {
                        "id": "check_manage_shifts",
                        "requirement_id": "req_manage_shifts",
                        "description": "A shift can be created and retrieved",
                        "kind": "api",
                    }
                ],
                "assumptions": [],
                "clarification_questions": [],
            },
            "files": [],
            "target_paths": ["frontend/src/generated-contract.ts"],
        },
    )

    assert response.status_code == 200
    patch = response.json()
    assert patch["planner"] == "deterministic-demo-v1"
    assert patch["requirement_ids"] == ["req_manage_shifts"]
    assert patch["changes"][0]["path"] == "frontend/src/generated-contract.ts"
    assert patch["changes"][0]["operation"] == "add"


def test_rejects_oversized_requests_before_parsing() -> None:
    response = client.post(
        "/v1/contracts/draft",
        headers={**AUTH, "Content-Length": "999999"},
        content=b"{}",
    )
    assert response.status_code == 413

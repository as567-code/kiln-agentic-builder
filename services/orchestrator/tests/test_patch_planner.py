from __future__ import annotations

import ast
import asyncio

from kiln_orchestrator.models import FileContext, ProposePatchRequest, RepairDiagnostic
from kiln_orchestrator.patch_planner import DemoPatchPlanner


def volunteer_request(stage: str, targets: list[str]) -> ProposePatchRequest:
    return ProposePatchRequest.model_validate(
        {
            "run_id": "run_12345678",
            "sequence": 1,
            "stage": stage,
            "contract": {
                "title": "Volunteer scheduling workspace",
                "summary": "Coordinate volunteer shifts for a neighborhood food pantry.",
                "requirements": [
                    {
                        "id": "req_assign_volunteers",
                        "statement": "Assign volunteers without exceeding shift capacity",
                        "priority": "must",
                    },
                    {
                        "id": "req_track_changes",
                        "statement": "Keep an activity history for schedule changes",
                        "priority": "must",
                    },
                ],
                "system_shape": {
                    "pages": ["Schedule", "Volunteers", "Activity"],
                    "entities": [
                        {
                            "name": "Volunteer",
                            "fields": [
                                {"name": "name", "type": "string", "required": True},
                                {"name": "email", "type": "email", "required": True},
                            ],
                        },
                        {
                            "name": "Shift",
                            "fields": [
                                {"name": "starts_at", "type": "datetime", "required": True},
                                {"name": "capacity", "type": "integer", "required": True},
                                {"name": "role", "type": "string", "required": True},
                            ],
                        },
                        {
                            "name": "Assignment",
                            "fields": [
                                {"name": "volunteer_id", "type": "uuid", "required": True},
                                {"name": "shift_id", "type": "uuid", "required": True},
                            ],
                        },
                    ],
                    "api_operations": [
                        {"method": "GET", "path": "/api/shifts", "purpose": "List shifts"},
                        {
                            "method": "POST",
                            "path": "/api/shifts",
                            "purpose": "Create a shift",
                        },
                        {
                            "method": "POST",
                            "path": "/api/assignments",
                            "purpose": "Assign a volunteer",
                        },
                        {
                            "method": "DELETE",
                            "path": "/api/assignments/{id}",
                            "purpose": "Remove an assignment",
                        },
                    ],
                },
                "acceptance_checks": [
                    {
                        "id": "check_assign_volunteers",
                        "requirement_id": "req_assign_volunteers",
                        "description": "Capacity is enforced",
                        "kind": "api",
                    }
                ],
                "assumptions": [],
                "clarification_questions": [],
            },
            "files": [],
            "target_paths": targets,
        }
    )


def test_deterministic_data_patch_contains_models_and_migration() -> None:
    result = asyncio.run(
        DemoPatchPlanner().propose_patch(
            volunteer_request(
                "data",
                [
                    "backend/app/generated_contract.py",
                    "backend/alembic/versions/0002_generated_contract.py",
                ],
            )
        )
    )

    assert len(result.changes) == 2
    for change in result.changes:
        assert change.content is not None
        ast.parse(change.content)
    models = result.changes[0].content or ""
    assert "class Volunteer(Base)" in models
    assert "class ActivityEvent(Base)" in models
    assert "ck_shifts_capacity_nonnegative" in models


def test_deterministic_api_patch_enforces_capacity_and_audit_history() -> None:
    result = asyncio.run(
        DemoPatchPlanner().propose_patch(
            volunteer_request("api", ["backend/app/api/generated_contract.py"])
        )
    )

    source = result.changes[0].content or ""
    ast.parse(source)
    assert "shift capacity reached" in source
    assert "_record_activity" in source
    assert '@router.delete("/api/assignments/{id}"' in source


def test_deterministic_inventory_patch_omits_unused_blueprint_imports() -> None:
    payload = volunteer_request("api", ["backend/app/api/generated_contract.py"]).model_dump(
        mode="json"
    )
    payload["contract"]["system_shape"] = {
        "pages": ["Inventory"],
        "entities": [
            {
                "name": "Ingredient",
                "fields": [{"name": "name", "type": "string", "required": True}],
            },
            {
                "name": "StockEvent",
                "fields": [{"name": "quantity", "type": "integer", "required": True}],
            },
        ],
        "api_operations": [
            {
                "method": "GET",
                "path": "/api/ingredients",
                "purpose": "Use the maintained blueprint endpoint",
            },
            {
                "method": "POST",
                "path": "/api/stock-events",
                "purpose": "Record a stock change",
            },
        ],
    }
    request = ProposePatchRequest.model_validate(payload)
    result = asyncio.run(DemoPatchPlanner().propose_patch(request))

    source = result.changes[0].content or ""
    ast.parse(source)
    fastapi_import = next(line for line in source.splitlines() if line.startswith("from fastapi"))
    assert "Response" not in fastapi_import
    assert "from sqlalchemy import select" not in source
    assert "from ..models import Ingredient" not in source
    assert "from sqlalchemy.exc import IntegrityError" in source


def test_deterministic_inventory_migration_stays_within_ruff_line_limit() -> None:
    payload = volunteer_request(
        "data", ["backend/alembic/versions/0002_generated_contract.py"]
    ).model_dump(mode="json")
    payload["contract"]["system_shape"] = {
        "pages": ["Inventory"],
        "entities": [
            {
                "name": "StockEvent",
                "fields": [{"name": "quantity_delta", "type": "number", "required": True}],
            }
        ],
        "api_operations": [
            {
                "method": "POST",
                "path": "/api/stock-events",
                "purpose": "Record a stock change",
            }
        ],
    }
    request = ProposePatchRequest.model_validate(payload)
    result = asyncio.run(DemoPatchPlanner().propose_patch(request))

    source = result.changes[0].content or ""
    ast.parse(source)
    assert "import sqlalchemy as sa\n\nfrom alembic import op" in source
    assert max(map(len, source.splitlines())) <= 100


def test_deterministic_inventory_patch_covers_non_blueprint_parameter_names() -> None:
    payload = volunteer_request("api", ["backend/app/api/generated_contract.py"]).model_dump(
        mode="json"
    )
    payload["contract"]["system_shape"] = {
        "pages": ["Inventory"],
        "entities": [
            {
                "name": "Ingredient",
                "fields": [
                    {"name": "name", "type": "string", "required": True},
                    {"name": "quantity", "type": "number", "required": True},
                    {"name": "reorder_level", "type": "number", "required": True},
                ],
            }
        ],
        "api_operations": [
            {
                "method": "PATCH",
                "path": "/api/ingredients/{id}",
                "purpose": "Update an ingredient",
            }
        ],
    }
    request = ProposePatchRequest.model_validate(payload)
    result = asyncio.run(DemoPatchPlanner().propose_patch(request))

    source = result.changes[0].content or ""
    ast.parse(source)
    assert "from ..models import Ingredient" in source
    assert '@router.patch("/api/ingredients/{id}"' in source


def test_deterministic_interface_patch_is_contract_driven() -> None:
    result = asyncio.run(
        DemoPatchPlanner().propose_patch(
            volunteer_request("interface", ["frontend/src/generated-contract.ts"])
        )
    )

    source = result.changes[0].content or ""
    assert "export const generatedContract" in source
    assert '"Volunteer"' in source
    assert '"/api/assignments"' in source


def test_repair_rewrites_only_supplied_extension_paths_from_diagnostics() -> None:
    targets = [
        "backend/app/generated_contract.py",
        "backend/alembic/versions/0002_generated_contract.py",
        "backend/app/api/generated_contract.py",
        "frontend/src/generated-contract.ts",
    ]
    request = volunteer_request("repair", targets).model_copy(
        update={
            "files": [
                FileContext(path=path, sha256="a" * 64, content="# existing\n") for path in targets
            ],
            "diagnostics": [
                RepairDiagnostic(
                    check_id="frontend:typecheck",
                    status="failed",
                    exit_code=2,
                    stderr="Type mismatch in generated contract",
                )
            ],
        }
    )
    result = asyncio.run(DemoPatchPlanner().propose_patch(request))

    assert [change.path for change in result.changes] == targets
    assert all(change.operation.value == "replace" for change in result.changes)
    assert all(change.expected_sha256 == "a" * 64 for change in result.changes)
    assert "tests and policy remain protected" in result.rationale

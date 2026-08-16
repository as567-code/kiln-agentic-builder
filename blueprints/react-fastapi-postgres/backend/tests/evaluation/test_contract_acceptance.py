from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from importlib import import_module
from pathlib import Path
from typing import TypedDict, cast

contract_path = Path(os.environ["KILN_CONTRACT_PATH"])
database_path = Path(__file__).with_name("contract-acceptance.db")
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{database_path}"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


class FieldSpec(TypedDict):
    name: str
    type: str
    required: bool


class EntitySpec(TypedDict):
    name: str
    fields: list[FieldSpec]


class OperationSpec(TypedDict):
    method: str
    path: str


class ContractSpec(TypedDict):
    title: str
    requirementIds: list[str]
    entities: list[EntitySpec]
    apiOperations: list[OperationSpec]


def load_contract() -> ContractSpec:
    value = json.loads(contract_path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Contract evidence must be an object")
    return cast(ContractSpec, value)


contract = load_contract()


def setup_module() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def teardown_module() -> None:
    Base.metadata.drop_all(bind=engine)
    database_path.unlink(missing_ok=True)


def test_generated_models_match_the_approved_contract() -> None:
    generated = import_module("app.generated_contract")
    assert generated.APP_TITLE == contract["title"]
    table_names = set(Base.metadata.tables)
    for entity in contract["entities"]:
        if entity["name"] == "Ingredient":
            continue
        assert table_name(entity["name"]) in table_names
    if "req_track_changes" in contract["requirementIds"]:
        assert "activity_events" in table_names


def test_openapi_exposes_every_approved_operation() -> None:
    with TestClient(app) as client:
        schema = client.get("/openapi.json")
    assert schema.status_code == 200
    paths = schema.json()["paths"]
    for operation in contract["apiOperations"]:
        assert operation["path"] in paths
        assert operation["method"].lower() in paths[operation["path"]]


def test_frontend_embeds_contract_provenance() -> None:
    source = (
        Path(__file__).parents[3] / "frontend" / "src" / "generated-contract.ts"
    ).read_text(encoding="utf-8")
    expected_values = [
        contract["title"],
        *contract["requirementIds"],
        *(entity["name"] for entity in contract["entities"]),
        *(operation["path"] for operation in contract["apiOperations"]),
    ]
    for value in expected_values:
        assert json.dumps(value) in source


def test_assignment_capacity_and_activity_history() -> None:
    entity_names = {entity["name"] for entity in contract["entities"]}
    if not {"Volunteer", "Shift", "Assignment"}.issubset(entity_names):
        return
    generated = import_module("app.generated_contract")
    volunteer_one = generated.Volunteer(name="Maya Chen", email="maya@example.org")
    volunteer_two = generated.Volunteer(name="Jon Bell", email="jon@example.org")
    shift = generated.Shift(
        starts_at=datetime(2026, 8, 18, 8, tzinfo=UTC),
        capacity=1,
        role="Pantry setup",
    )
    with SessionLocal() as session:
        session.add_all([volunteer_one, volunteer_two, shift])
        session.commit()
        volunteer_one_id = volunteer_one.id
        volunteer_two_id = volunteer_two.id
        shift_id = shift.id

    with TestClient(app) as client:
        accepted = client.post(
            "/api/assignments",
            json={"volunteer_id": volunteer_one_id, "shift_id": shift_id},
        )
        blocked = client.post(
            "/api/assignments",
            json={"volunteer_id": volunteer_two_id, "shift_id": shift_id},
        )
        assert accepted.status_code == 201
        assert blocked.status_code == 409
        assignment_id = accepted.json()["id"]
        removed = client.delete(f"/api/assignments/{assignment_id}")
        assert removed.status_code == 204

    with SessionLocal() as session:
        activity_count = session.scalar(select(func.count(generated.ActivityEvent.id)))
    assert int(activity_count or 0) >= 2


def table_name(name: str) -> str:
    output = ""
    for index, character in enumerate(name):
        if index and character.isupper():
            output += "_"
        output += character.lower()
    if output.endswith("y") and not output.endswith(("ay", "ey", "iy", "oy", "uy")):
        return output[:-1] + "ies"
    if output.endswith("s"):
        return output + "es"
    return output + "s"

from __future__ import annotations

import os
from pathlib import Path

database_path = Path(__file__).with_name("test.db")
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{database_path}"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


def setup_module() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def teardown_module() -> None:
    Base.metadata.drop_all(bind=engine)
    database_path.unlink(missing_ok=True)


def test_inventory_crud_flow() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/ingredients",
            json={
                "name": "Bread flour",
                "unit": "kg",
                "quantity": 46,
                "reorder_level": 12,
            },
        )
        assert created.status_code == 201
        ingredient_id = created.json()["id"]

        listed = client.get("/api/ingredients")
        assert listed.status_code == 200
        assert listed.json()[0]["name"] == "Bread flour"

        updated = client.patch(
            f"/api/ingredients/{ingredient_id}",
            json={"quantity": 8},
        )
        assert updated.status_code == 200
        assert updated.json()["quantity"] == 8


def test_rejects_duplicate_and_invalid_inventory() -> None:
    with TestClient(app) as client:
        payload = {"name": "Butter", "unit": "kg", "quantity": 5, "reorder_level": 2}
        assert client.post("/api/ingredients", json=payload).status_code == 201
        assert client.post("/api/ingredients", json=payload).status_code == 409
        assert (
            client.post(
                "/api/ingredients",
                json={**payload, "name": "Milk", "quantity": -1},
            ).status_code
            == 422
        )

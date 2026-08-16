from __future__ import annotations

import os
from pathlib import Path

database_path = Path(__file__).with_name("preview-smoke.db")
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


def test_verified_frontend_artifact_and_api_are_bootable() -> None:
    workspace = Path(__file__).parents[3]
    index = (workspace / "frontend" / "dist" / "index.html").read_text(encoding="utf-8")
    assert '<div id="root"></div>' in index
    assert "/assets/" in index
    with TestClient(app) as client:
        health = client.get("/healthz")
        contract = client.get("/api/generated-contract")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    assert contract.status_code in {200, 404}

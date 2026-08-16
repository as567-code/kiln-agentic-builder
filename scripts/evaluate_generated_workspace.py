from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from kiln_orchestrator.models import (
    DraftContractRequest,
    ModelContractDraft,
    ProposePatchRequest,
)
from kiln_orchestrator.patch_planner import DemoPatchPlanner
from kiln_orchestrator.planner import DemoPlanner

ROOT = Path(__file__).resolve().parents[1]
BLUEPRINT = ROOT / "blueprints" / "react-fastapi-postgres"
EVALUATION_ROOT = ROOT / "work" / "evaluations"
TARGETS = {
    "data": [
        "backend/app/generated_contract.py",
        "backend/alembic/versions/0002_generated_contract.py",
    ],
    "api": ["backend/app/api/generated_contract.py"],
    "interface": ["frontend/src/generated-contract.ts"],
}


async def materialize(brief: str, workspace: Path) -> ModelContractDraft:
    draft = await DemoPlanner().draft_contract(
        DraftContractRequest(project_id="prj_evaluation01", brief=brief)
    )
    contract = ModelContractDraft.model_validate(
        draft.model_dump(
            exclude={"planner", "model", "provider_request_id", "usage"}
        )
    )
    planner = DemoPatchPlanner()
    for sequence, (stage, targets) in enumerate(TARGETS.items(), start=1):
        proposal = await planner.propose_patch(
            ProposePatchRequest(
                run_id="run_0123456789abcdef0123456789abcdef",
                sequence=sequence,
                stage=stage,
                contract=contract,
                files=[],
                target_paths=targets,
            )
        )
        for change in proposal.changes:
            if change.content is None:
                raise RuntimeError("Evaluation patch unexpectedly deleted a file")
            target = (workspace / change.path).resolve()
            if workspace.resolve() not in target.parents:
                raise RuntimeError("Evaluation patch escaped its workspace")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(change.content, encoding="utf-8")
    return contract


def run(command: list[str], *, cwd: Path, env: dict[str, str]) -> None:
    print(f"→ {' '.join(command)}")
    subprocess.run(command, cwd=cwd, env=env, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Materialize and verify Kiln's offline demo build")
    parser.add_argument(
        "--brief",
        default="Build a volunteer scheduling tool for a neighborhood food pantry.",
    )
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()

    EVALUATION_ROOT.mkdir(parents=True, exist_ok=True)
    workspace = Path(tempfile.mkdtemp(prefix="kiln-eval-", dir=EVALUATION_ROOT))
    shutil.copytree(
        BLUEPRINT,
        workspace,
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("node_modules", "dist", "__pycache__", "*.db"),
    )
    contract = asyncio.run(materialize(args.brief, workspace))
    contract_path = workspace / ".kiln-contract.json"
    contract_path.write_text(
        json.dumps(
            {
                "title": contract.title,
                "requirementIds": [item.id for item in contract.requirements],
                "entities": [item.model_dump(mode="json") for item in contract.system_shape.entities],
                "apiOperations": [
                    {"method": item.method, "path": item.path}
                    for item in contract.system_shape.api_operations
                ],
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    source_modules = BLUEPRINT / "frontend" / "node_modules"
    target_modules = workspace / "frontend" / "node_modules"
    if source_modules.exists():
        target_modules.symlink_to(source_modules, target_is_directory=True)

    environment = {
        **os.environ,
        "KILN_CONTRACT_PATH": str(contract_path),
        "DATABASE_URL": f"sqlite:///{workspace / 'backend' / 'evaluation.db'}",
        "ENVIRONMENT": "test",
        "CI": "1",
    }
    python = sys.executable
    backend = workspace / "backend"
    frontend = workspace / "frontend"
    try:
        run([python, "-m", "ruff", "check", "."], cwd=backend, env=environment)
        run([python, "-m", "mypy", "app", "tests", "--strict"], cwd=backend, env=environment)
        run([python, "-m", "alembic", "upgrade", "head"], cwd=backend, env=environment)
        run(["npm", "run", "typecheck"], cwd=frontend, env=environment)
        run(["npm", "test", "--", "--run"], cwd=frontend, env=environment)
        run([python, "-m", "pytest", "-q"], cwd=backend, env=environment)
        run(
            [python, "-m", "pytest", "-q", "tests/evaluation/test_contract_acceptance.py"],
            cwd=backend,
            env=environment,
        )
        run(
            [python, "-m", "pytest", "-q", "tests/evaluation/test_source_policy.py"],
            cwd=backend,
            env=environment,
        )
        run(["npm", "run", "build"], cwd=frontend, env=environment)
        run(
            [python, "-m", "pytest", "-q", "tests/evaluation/test_preview_smoke.py"],
            cwd=backend,
            env=environment,
        )
        print(f"✓ verified generated workspace: {workspace}")
    finally:
        if not args.keep:
            shutil.rmtree(workspace)


if __name__ == "__main__":
    main()

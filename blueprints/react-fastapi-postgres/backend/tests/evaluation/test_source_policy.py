from __future__ import annotations

import ast
from pathlib import Path

workspace = Path(__file__).parents[3]
generated_paths = [
    workspace / "backend" / "app" / "generated_contract.py",
    workspace / "backend" / "app" / "api" / "generated_contract.py",
    workspace / "backend" / "alembic" / "versions" / "0002_generated_contract.py",
    workspace / "frontend" / "src" / "generated-contract.ts",
]
forbidden_imports = {"ctypes", "httpx", "requests", "socket", "subprocess", "urllib"}
forbidden_calls = {"__import__", "compile", "eval", "exec"}


def test_generated_python_has_no_dangerous_execution_primitives() -> None:
    for path in generated_paths:
        if path.suffix != ".py" or not path.exists():
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                assert not {alias.name.split(".", 1)[0] for alias in node.names} & forbidden_imports
            if isinstance(node, ast.ImportFrom) and node.module:
                assert node.module.split(".", 1)[0] not in forbidden_imports
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                assert node.func.id not in forbidden_calls
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                assert node.func.attr not in {"popen", "spawn", "system"}


def test_generated_frontend_has_no_dynamic_code_or_secret_access() -> None:
    source_path = workspace / "frontend" / "src" / "generated-contract.ts"
    source = source_path.read_text(encoding="utf-8")
    assert "eval(" not in source
    assert "new Function" not in source
    assert "document.cookie" not in source
    assert "localStorage" not in source
    assert "sessionStorage" not in source


def test_generated_files_stay_inside_the_extension_allowlist() -> None:
    assert all(path.exists() for path in generated_paths)
    assert all(path.stat().st_size <= 256 * 1024 for path in generated_paths)

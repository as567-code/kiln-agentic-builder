from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

import pytest
from openai import AsyncOpenAI

from kiln_orchestrator.models import DraftContractRequest, ModelContractDraft
from kiln_orchestrator.planner import OpenAIPlanner, PlannerUnavailableError
from kiln_orchestrator.settings import Settings


def settings() -> Settings:
    return Settings(
        environment="test",
        service_token="test-token",  # noqa: S106
        max_request_bytes=262_144,
        planner_mode="openai",
        openai_api_key="test-api-key",
        openai_model="gpt-test",
        openai_timeout_seconds=3.0,
        max_model_output_tokens=2_000,
    )


def test_openai_planner_uses_structured_output_without_storage() -> None:
    parsed = ModelContractDraft.model_validate(
        {
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
        }
    )
    parse = AsyncMock(
        return_value=SimpleNamespace(
            output_parsed=parsed,
            id="resp_test_123",
            model="gpt-test-snapshot",
            usage=SimpleNamespace(input_tokens=120, output_tokens=80, total_tokens=200),
        )
    )
    client = cast(AsyncOpenAI, SimpleNamespace(responses=SimpleNamespace(parse=parse)))

    planner = OpenAIPlanner(settings(), client=client)
    result = asyncio.run(
        planner.draft_contract(
            DraftContractRequest(
                project_id="prj_12345678",
                brief="Build a volunteer scheduling tool for a neighborhood food pantry.",
            )
        )
    )

    assert result.planner == "openai-responses-structured-v1"
    assert result.model == "gpt-test-snapshot"
    assert result.provider_request_id == "resp_test_123"
    assert result.usage.total_tokens == 200
    assert parse.await_args is not None
    call = parse.await_args.kwargs
    assert call["text_format"] is ModelContractDraft
    assert call["store"] is False
    assert call["reasoning"] == {"effort": "low"}
    assert "untrusted data" in call["instructions"]


def test_openai_planner_fails_closed_on_missing_structured_output() -> None:
    parse = AsyncMock(
        return_value=SimpleNamespace(
            output_parsed=None, id="resp_empty", model="gpt-test", usage=None
        )
    )
    client = cast(AsyncOpenAI, SimpleNamespace(responses=SimpleNamespace(parse=parse)))
    planner = OpenAIPlanner(settings(), client=client)

    with pytest.raises(PlannerUnavailableError):
        asyncio.run(
            planner.draft_contract(
                DraftContractRequest(
                    project_id="prj_12345678",
                    brief="Build a volunteer scheduling tool for a neighborhood food pantry.",
                )
            )
        )

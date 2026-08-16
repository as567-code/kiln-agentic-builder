from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RequirementPriority(StrEnum):
    MUST = "must"
    SHOULD = "should"
    COULD = "could"


class Requirement(StrictModel):
    id: str = Field(pattern=r"^req_[a-z0-9_]+$")
    statement: str = Field(min_length=4, max_length=240)
    priority: RequirementPriority


class EntityField(StrictModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9_]{0,62}$")
    type: str = Field(min_length=1, max_length=64)
    required: bool = True


class Entity(StrictModel):
    name: str = Field(pattern=r"^[A-Z][A-Za-z0-9]{0,62}$")
    fields: list[EntityField] = Field(min_length=1, max_length=32)


class ApiOperation(StrictModel):
    method: str = Field(pattern=r"^(GET|POST|PUT|PATCH|DELETE)$")
    path: str = Field(pattern=r"^/api/[A-Za-z0-9_/{}/-]+$")
    purpose: str = Field(min_length=4, max_length=160)


class SystemShape(StrictModel):
    pages: list[str] = Field(min_length=1, max_length=12)
    entities: list[Entity] = Field(min_length=1, max_length=12)
    api_operations: list[ApiOperation] = Field(min_length=1, max_length=32)


class AcceptanceCheck(StrictModel):
    id: str = Field(pattern=r"^check_[a-z0-9_]+$")
    requirement_id: str = Field(pattern=r"^req_[a-z0-9_]+$")
    description: str = Field(min_length=4, max_length=240)
    kind: str = Field(pattern=r"^(browser|api|database|accessibility|security)$")


class DraftContractRequest(StrictModel):
    project_id: str = Field(pattern=r"^prj_[A-Za-z0-9_-]{8,64}$")
    brief: str = Field(min_length=20, max_length=5000)

    @field_validator("brief")
    @classmethod
    def reject_control_characters(cls, value: str) -> str:
        if any(ord(char) < 32 and char not in "\n\t\r" for char in value):
            raise ValueError("brief contains unsupported control characters")
        return value


class ModelContractDraft(StrictModel):
    title: str = Field(min_length=2, max_length=80)
    summary: str = Field(min_length=8, max_length=500)
    requirements: list[Requirement] = Field(min_length=1, max_length=12)
    system_shape: SystemShape
    acceptance_checks: list[AcceptanceCheck] = Field(min_length=1, max_length=24)
    assumptions: list[str] = Field(max_length=8)
    clarification_questions: list[str] = Field(max_length=3)


class ModelUsage(StrictModel):
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    total_tokens: int = Field(ge=0)


class DraftContractResponse(ModelContractDraft):
    planner: str
    model: str
    provider_request_id: str | None = None
    usage: ModelUsage


class PatchStage(StrEnum):
    DATA = "data"
    API = "api"
    INTERFACE = "interface"
    REPAIR = "repair"


class PatchOperation(StrEnum):
    ADD = "add"
    REPLACE = "replace"
    DELETE = "delete"


class FileContext(StrictModel):
    path: str = Field(pattern=r"^[A-Za-z0-9._/-]{1,240}$")
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    content: str = Field(max_length=12_000)


class RepairDiagnostic(StrictModel):
    check_id: str = Field(pattern=r"^[a-z]+:[a-z_]+$")
    status: str = Field(pattern=r"^(failed|timed_out)$")
    exit_code: int | None = Field(default=None, ge=0, le=255)
    stdout: str = Field(default="", max_length=4_000)
    stderr: str = Field(default="", max_length=4_000)
    output_truncated: bool = False


class ProposePatchRequest(StrictModel):
    run_id: str = Field(pattern=r"^run_[A-Za-z0-9_-]{8,64}$")
    sequence: int = Field(ge=1, le=50)
    stage: PatchStage
    contract: ModelContractDraft
    files: list[FileContext] = Field(max_length=40)
    target_paths: list[str] = Field(min_length=1, max_length=20)
    diagnostics: list[RepairDiagnostic] = Field(default_factory=list, max_length=8)


class ModelPatchChange(StrictModel):
    path: str = Field(pattern=r"^[A-Za-z0-9._/-]{1,240}$")
    operation: PatchOperation
    content: str | None = Field(default=None, max_length=120_000)
    expected_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")

    @model_validator(mode="after")
    def validate_operation_fields(self) -> ModelPatchChange:
        if self.operation is PatchOperation.ADD:
            if self.content is None or self.expected_sha256 is not None:
                raise ValueError("add requires content and no expected hash")
        elif self.operation is PatchOperation.DELETE:
            if self.content is not None or self.expected_sha256 is None:
                raise ValueError("delete requires an expected hash and no content")
        elif self.content is None or self.expected_sha256 is None:
            raise ValueError("replace requires content and an expected hash")
        return self


class ModelPatchDraft(StrictModel):
    summary: str = Field(min_length=4, max_length=240)
    rationale: str = Field(min_length=4, max_length=500)
    requirement_ids: list[str] = Field(min_length=1, max_length=12)
    changes: list[ModelPatchChange] = Field(min_length=1, max_length=20)


class PatchDraftResponse(ModelPatchDraft):
    planner: str
    model: str
    provider_request_id: str | None = None
    usage: ModelUsage


class RunState(StrEnum):
    INTAKE = "intake"
    SPECIFY = "specify"
    CONTRACT_REVIEW = "contract_review"
    PLAN = "plan"
    USER_APPROVAL = "user_approval"
    SCAFFOLD = "scaffold"
    GENERATE_PATCHES = "generate_patches"
    STATIC_CHECK = "static_check"
    BUILD = "build"
    TEST = "test"
    DIAGNOSE = "diagnose"
    REPAIR_PATCH = "repair_patch"
    PREVIEW = "preview"
    SECURITY_SCAN = "security_scan"
    READY = "ready"
    DEPLOY_APPROVAL = "deploy_approval"
    DEPLOYED = "deployed"
    FAILED_WITH_EVIDENCE = "failed_with_evidence"
    CANCELLED = "cancelled"


class TransitionRequest(StrictModel):
    run_id: str = Field(pattern=r"^run_[A-Za-z0-9_-]{8,64}$")
    from_state: RunState
    to_state: RunState
    attempt: int = Field(default=0, ge=0, le=3)


class TransitionResponse(StrictModel):
    run_id: str
    from_state: RunState
    to_state: RunState
    allowed: bool

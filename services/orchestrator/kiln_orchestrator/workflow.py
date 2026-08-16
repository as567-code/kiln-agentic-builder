from __future__ import annotations

from .models import RunState

TRANSITIONS: dict[RunState, frozenset[RunState]] = {
    RunState.INTAKE: frozenset({RunState.SPECIFY, RunState.CANCELLED}),
    RunState.SPECIFY: frozenset(
        {RunState.CONTRACT_REVIEW, RunState.FAILED_WITH_EVIDENCE, RunState.CANCELLED}
    ),
    RunState.CONTRACT_REVIEW: frozenset({RunState.PLAN, RunState.SPECIFY, RunState.CANCELLED}),
    RunState.PLAN: frozenset(
        {RunState.USER_APPROVAL, RunState.FAILED_WITH_EVIDENCE, RunState.CANCELLED}
    ),
    RunState.USER_APPROVAL: frozenset({RunState.SCAFFOLD, RunState.PLAN, RunState.CANCELLED}),
    RunState.SCAFFOLD: frozenset(
        {RunState.GENERATE_PATCHES, RunState.DIAGNOSE, RunState.CANCELLED}
    ),
    RunState.GENERATE_PATCHES: frozenset(
        {RunState.STATIC_CHECK, RunState.DIAGNOSE, RunState.CANCELLED}
    ),
    RunState.STATIC_CHECK: frozenset({RunState.BUILD, RunState.DIAGNOSE, RunState.CANCELLED}),
    RunState.BUILD: frozenset({RunState.TEST, RunState.DIAGNOSE, RunState.CANCELLED}),
    RunState.TEST: frozenset({RunState.PREVIEW, RunState.DIAGNOSE, RunState.CANCELLED}),
    RunState.DIAGNOSE: frozenset(
        {RunState.REPAIR_PATCH, RunState.FAILED_WITH_EVIDENCE, RunState.CANCELLED}
    ),
    RunState.REPAIR_PATCH: frozenset(
        {RunState.STATIC_CHECK, RunState.FAILED_WITH_EVIDENCE, RunState.CANCELLED}
    ),
    RunState.PREVIEW: frozenset({RunState.SECURITY_SCAN, RunState.DIAGNOSE, RunState.CANCELLED}),
    RunState.SECURITY_SCAN: frozenset(
        {RunState.READY, RunState.FAILED_WITH_EVIDENCE, RunState.CANCELLED}
    ),
    RunState.READY: frozenset({RunState.DEPLOY_APPROVAL}),
    RunState.DEPLOY_APPROVAL: frozenset({RunState.DEPLOYED, RunState.READY, RunState.CANCELLED}),
    RunState.DEPLOYED: frozenset(),
    RunState.FAILED_WITH_EVIDENCE: frozenset(),
    RunState.CANCELLED: frozenset(),
}


def can_transition(from_state: RunState, to_state: RunState, attempt: int = 0) -> bool:
    if from_state is RunState.DIAGNOSE and to_state is RunState.REPAIR_PATCH and attempt >= 3:
        return False
    return to_state in TRANSITIONS[from_state]

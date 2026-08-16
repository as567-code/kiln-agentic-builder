from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse

from .models import (
    DraftContractRequest,
    DraftContractResponse,
    PatchDraftResponse,
    ProposePatchRequest,
    TransitionRequest,
    TransitionResponse,
)
from .patch_planner import PatchPlanner, build_patch_planner
from .planner import Planner, PlannerUnavailableError, build_planner
from .security import require_service_token
from .settings import get_settings
from .workflow import can_transition

app = FastAPI(
    title="Kiln Orchestrator",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.state.planner = build_planner(get_settings())
app.state.patch_planner = build_patch_planner(get_settings())


@app.middleware("http")
async def secure_request(
    request: Request,
    call_next: Callable[[Request], Awaitable[JSONResponse]],
) -> JSONResponse:
    settings = get_settings()
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > settings.max_request_bytes:
                return JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={"detail": "request is too large"},
                )
        except ValueError:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": "invalid content length"},
            )

    request_id = request.headers.get("x-request-id") or f"req_{uuid.uuid4().hex}"
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/healthz", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "kiln-orchestrator"}


@app.get("/readyz", include_in_schema=False)
async def ready() -> dict[str, str]:
    settings = get_settings()
    if not settings.service_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="service authentication is not configured",
        )
    return {"status": "ready"}


@app.post(
    "/v1/contracts/draft",
    response_model=DraftContractResponse,
    dependencies=[Depends(require_service_token)],
)
async def draft_contract(request: DraftContractRequest) -> DraftContractResponse:
    planner: Planner = app.state.planner
    try:
        return await planner.draft_contract(request)
    except PlannerUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from None


@app.post(
    "/v1/patches/propose",
    response_model=PatchDraftResponse,
    dependencies=[Depends(require_service_token)],
)
async def propose_patch(request: ProposePatchRequest) -> PatchDraftResponse:
    planner: PatchPlanner = app.state.patch_planner
    try:
        return await planner.propose_patch(request)
    except PlannerUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from None


@app.post(
    "/v1/runs/transition",
    response_model=TransitionResponse,
    dependencies=[Depends(require_service_token)],
)
async def transition_run(request: TransitionRequest) -> TransitionResponse:
    allowed = can_transition(request.from_state, request.to_state, request.attempt)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="run transition is not allowed",
        )
    return TransitionResponse(
        run_id=request.run_id,
        from_state=request.from_state,
        to_state=request.to_state,
        allowed=True,
    )

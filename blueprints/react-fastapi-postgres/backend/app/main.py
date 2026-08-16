from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from importlib import import_module
from typing import cast

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from .api.inventory import router as inventory_router
from .database import Base, engine
from .settings import get_settings

settings = get_settings()


def load_generated_router() -> APIRouter | None:
    """Load only Kiln's generated extension point when a patch supplied it."""
    try:
        import_module("app.generated_contract")
        module = import_module("app.api.generated_contract")
    except ModuleNotFoundError as error:
        if error.name in {"app.generated_contract", "app.api.generated_contract"}:
            return None
        raise
    return cast(APIRouter, module.router)


generated_router = load_generated_router()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    if settings.environment == "test":
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Pantry API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)
app.include_router(inventory_router)
if generated_router is not None:
    app.include_router(generated_router)


@app.middleware("http")
async def security_headers(request: Request, call_next: RequestResponseEndpoint) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return response


@app.get("/healthz", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}

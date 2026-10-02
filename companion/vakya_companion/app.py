import hmac
import logging
import threading
from typing import Literal

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.datastructures import Headers

from .engine import Engine, Language, ProviderError

ORIGINS = {
    "http://localhost:19006", "http://127.0.0.1:19006",
    "https://charannampally.github.io",
}
logger = logging.getLogger("vakya")


def failure(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


class RequestGuard:
    def __init__(self, app, token: str):
        self.app = app
        self.token = token

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        host = headers.get("host", "").split(":")[0]
        origin = headers.get("origin")
        error = None
        if host not in {"127.0.0.1", "localhost"} or (origin and origin not in ORIGINS):
            error = failure("forbidden_origin", "This origin or host is not allowed.", 403)
        elif not hmac.compare_digest(headers.get("authorization", "").encode(), f"Bearer {self.token}".encode()):
            error = failure("unauthorized", "Pair with the local companion first.", 401)
        elif scope["method"] == "POST" and headers.get("content-type", "").split(";")[0] != "application/json":
            error = failure("invalid_request", "Expected application/json.", 415)
        if error:
            await error(scope, receive, send)
            return
        chunks = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > 16384:
                await failure("invalid_request", "Request exceeds 16 KiB.", 413)(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        async def replay():
            nonlocal chunks
            if chunks is not None:
                body = b"".join(chunks)
                chunks = None
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)


class TextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=400)


class TeachRequest(TextRequest):
    sourceLanguage: Language


class HistoryItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=400)


class ConversationRequest(TeachRequest):
    supportLanguage: Literal["en", "hi", "te"]
    level: Literal["beginner", "intermediate", "advanced"]
    history: list[HistoryItem] = Field(default_factory=list, max_length=6)


def create_app(token: str, engine: Engine | None = None) -> FastAPI:
    if len(token) < 32:
        raise ValueError("Pairing token must contain at least 32 characters.")
    engine = engine or Engine()
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    lock = threading.Lock()
    app.add_middleware(RequestGuard, token=token)
    app.add_middleware(
        CORSMiddleware, allow_origins=sorted(ORIGINS),
        allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def private_network_header(request, call_next):
        response = await call_next(request)
        if (request.headers.get("origin") in ORIGINS
                and request.headers.get("access-control-request-private-network") == "true"):
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        # Pydantic's default error includes the input; do not echo learner content.
        return failure("invalid_request", "Check the text, language, level, and history limits.", 422)

    def run(operation, *args):
        if not lock.acquire(blocking=False):
            return failure("busy", "Another local inference is still running.", 429)
        try:
            return operation(*args)
        except ProviderError as error:
            logger.warning("Provider operation failed: %s", error.code)
            return failure(error.code, str(error), 503 if error.code == "provider_unavailable" else 422)
        except Exception as error:
            logger.error("Inference failed (%s)", type(error).__name__)
            return failure("inference_failed", "Local inference failed; check provider installation.", 500)
        finally:
            lock.release()

    @app.get("/v1/capabilities")
    def capabilities():
        return run(engine.capabilities)

    @app.post("/v1/teach")
    def teach(body: TeachRequest):
        return run(engine.teach, body.text, body.sourceLanguage)

    @app.post("/v1/analyze")
    def analyze(body: TextRequest):
        return run(engine.analyze, body.text)

    @app.post("/v1/converse")
    def converse(body: ConversationRequest):
        return run(
            engine.converse, body.text, body.sourceLanguage, body.supportLanguage,
            body.level, [item.model_dump() for item in body.history],
        )

    @app.post("/v1/speak")
    def speak(body: TextRequest):
        result = run(engine.speak, body.text)
        return Response(result, media_type="audio/wav") if isinstance(result, bytes) else result

    return app

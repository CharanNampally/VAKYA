import logging
import threading

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import Headers

from vakya_companion.app import ORIGINS, ConversationRequest, TeachRequest, TextRequest, failure
from vakya_companion.engine import ProviderError
from engine import HostedEngine
from quota import DailyQuota

logger = logging.getLogger("vakya.hosted")


class PublicGuard:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)
        origin = headers.get("origin")
        if origin and origin not in ORIGINS:
            return await failure("forbidden_origin", "Origin not allowed.", 403)(scope, receive, send)
        if scope["method"] == "POST" and headers.get("content-type", "").split(";")[0] != "application/json":
            return await failure("invalid_request", "Expected JSON.", 415)(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > 16384:
                return await failure("invalid_request", "Request exceeds 16 KiB.", 413)(scope, receive, send)
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)


def create_app(engine=None, quota_factory=DailyQuota):
    engine = engine or HostedEngine()
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(PublicGuard)
    app.add_middleware(CORSMiddleware, allow_origins=sorted(ORIGINS),
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
    lock = threading.Lock()
    quota = None

    @app.exception_handler(RequestValidationError)
    async def invalid(request, error):
        return failure("invalid_request", "Check the input language, text length, and history.", 422)

    def run(request, operation, *args):
        nonlocal quota
        if not lock.acquire(blocking=False):
            return failure("busy", "Another request is running. Retry shortly.", 429)
        try:
            if quota is None:
                quota = quota_factory()
            # Best-effort client quota; the atomic global quota remains the cost boundary.
            forwarded = request.headers.get("x-forwarded-for", "").split(",")
            client = forwarded[-1].strip() or (request.client.host if request.client else "unknown")
            quota.take(client)
            return operation(*args)
        except ProviderError as error:
            status = 429 if error.code in ("quota_exceeded", "busy") else 503 if error.code == "provider_unavailable" else 422
            logger.warning("Provider failure: %s", error.code)
            return failure(error.code, str(error), status)
        except Exception as error:
            logger.error("Hosted operation failed: %s", type(error).__name__)
            return failure("inference_failed", "Server inference failed. Please retry later.", 503)
        finally:
            lock.release()

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "vakya-tutor", "version": 1}

    @app.get("/v1/capabilities")
    def capabilities():
        return engine.capabilities()

    @app.post("/v1/teach")
    def teach(body: TeachRequest, request: Request):
        return run(request, engine.teach, body.text, body.sourceLanguage)

    @app.post("/v1/analyze")
    def analyze(body: TextRequest, request: Request):
        return run(request, engine.analyze, body.text)

    @app.post("/v1/converse")
    def converse(body: ConversationRequest, request: Request):
        return run(request, engine.converse, body.text, body.sourceLanguage, body.supportLanguage,
                   body.level, [item.model_dump() for item in body.history])

    return app


app = create_app()

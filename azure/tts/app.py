import hashlib
import io
import json
import os
import re
import threading
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import soundfile as sf
from azure.core.exceptions import ResourceNotFoundError
from azure.data.tables import TableClient, UpdateMode
from azure.identity import DefaultAzureCredential
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

VAGDHENU = Path("/opt/vagdhenu")
BANK = VAGDHENU / "src/reference_bank/bank.json"
VOCAB = VAGDHENU / "models/vocab.txt"
VOICE = VAGDHENU / "models/voice_steer_ema_2026-06-17.pt"
VOCODER = VAGDHENU / "models/voc_bigvgan_EMA_2026-06-11.pth"
ORIGINS = [
    value.strip()
    for value in os.environ.get(
        "VAKYA_ALLOWED_ORIGINS",
        "https://charannampally.github.io,http://localhost:19006,http://127.0.0.1:19006",
    ).split(",")
    if value.strip()
]


class SpeechRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=500)
    meter: str | None = Field(default=None, max_length=64)
    seed: int = Field(default=60, ge=0, le=1000)


class DailyQuota:
    def __init__(self):
        endpoint = os.environ.get("AZURE_STORAGE_TABLE_ENDPOINT")
        if not endpoint:
            raise RuntimeError("AZURE_STORAGE_TABLE_ENDPOINT is required.")
        self.table = TableClient(
            endpoint=endpoint,
            table_name=os.environ.get("VAKYA_QUOTA_TABLE", "VakyaTtsQuota"),
            credential=DefaultAzureCredential(),
        )
        self.global_limit = int(os.environ.get("VAKYA_GLOBAL_DAILY_LIMIT", "50"))
        self.client_limit = int(os.environ.get("VAKYA_CLIENT_DAILY_LIMIT", "10"))
        self.lock = threading.Lock()

    def _increment(self, day: str, key: str, limit: int) -> None:
        try:
            entity = self.table.get_entity(day, key)
        except ResourceNotFoundError:
            self.table.create_entity({"PartitionKey": day, "RowKey": key, "count": 1})
            return
        count = int(entity["count"])
        if count >= limit:
            raise HTTPException(status_code=429, detail="Daily Sanskrit speech limit reached.")
        entity["count"] = count + 1
        self.table.update_entity(entity, mode=UpdateMode.REPLACE)

    def take(self, client: str) -> None:
        day = datetime.now(UTC).date().isoformat()
        client_key = "client-" + hashlib.sha256(client.encode()).hexdigest()[:24]
        with self.lock:
            self._increment(day, "global", self.global_limit)
            self._increment(day, client_key, self.client_limit)


class SpeechEngine:
    def __init__(self):
        self.renderer = None
        self.lock = threading.Lock()
        with BANK.open(encoding="utf-8") as file:
            bank = json.load(file)
        self.meters = {
            key for key, value in bank.items()
            if not key.startswith("_") and isinstance(value, dict) and "wav" in value
        }
        self.aliases = {}
        for key, value in bank.items():
            if key not in self.meters:
                continue
            self.aliases[key.lower()] = key
            self.aliases[value["wav"].removesuffix(".wav").lower()] = key
        self.fallback = "vasantatilakā" if "vasantatilakā" in self.meters else next(iter(self.meters))

    def _renderer(self):
        if self.renderer is None:
            from render_core import Renderer
            self.renderer = Renderer(
                str(VOICE),
                str(VOCODER),
                str(BANK),
                device="cuda",
                vocab_file=str(VOCAB),
                nfe=int(os.environ.get("VAGDHENU_NFE", "32")),
            )
        return self.renderer

    def render(self, body: SpeechRequest) -> bytes:
        if not re.search(r"[\u0900-\u097f]", body.text):
            raise HTTPException(status_code=422, detail="Expected Sanskrit text in Devanagari.")
        requested_meter = self.aliases.get(body.meter.lower()) if body.meter else None
        if body.meter and not requested_meter:
            raise HTTPException(status_code=422, detail="Unsupported Sanskrit meter.")
        with self.lock:
            from render_core import detect_meter_key
            detected = detect_meter_key(body.text)
            meter = requested_meter or self.aliases.get(detected.lower(), self.fallback)
            sample_rate, audio = self._renderer().render_one(body.text, meter, seed=body.seed)
            output = io.BytesIO()
            sf.write(output, np.asarray(audio, dtype="float32"), sample_rate, format="WAV")
            return output.getvalue()


quota: DailyQuota | None = None
engine = SpeechEngine()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health():
    return {"status": "ok", "model": "prathoshap/vagdhenu"}


@app.post("/v1/speak")
def speak(body: SpeechRequest, request: Request):
    global quota
    if quota is None:
        quota = DailyQuota()
    forwarded = request.headers.get("x-forwarded-for", "")
    client = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    quota.take(client)
    try:
        audio = engine.render(body)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail="Sanskrit speech generation failed.") from error
    return Response(
        audio,
        media_type="audio/wav",
        headers={
            "Cache-Control": "private, max-age=86400",
            "X-Vakya-Speech-Model": "Vagdhenu",
        },
    )

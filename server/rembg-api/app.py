import asyncio
import base64
import binascii
import hashlib
import hmac
import json
import os
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps


MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
MAX_IMAGE_SIDE = int(os.getenv("MAX_IMAGE_SIDE", "1800"))
MODEL_NAME = os.getenv("REMBG_MODEL", "u2net")
AUTH_SECRET = os.getenv("REMBG_AUTH_SECRET", "")
DAILY_REQUEST_LIMIT = max(0, int(os.getenv("DAILY_REQUEST_LIMIT", "5")))
MINUTE_REQUEST_LIMIT = max(0, int(os.getenv("MINUTE_REQUEST_LIMIT", "2")))
RATE_LIMIT_DB_PATH = os.getenv("RATE_LIMIT_DB_PATH", "/data/rembg-rate-limit.db")
PROCESSING_CONCURRENCY = max(1, int(os.getenv("PROCESSING_CONCURRENCY", "1")))
MAX_QUEUE_SIZE = max(0, int(os.getenv("MAX_QUEUE_SIZE", "2")))
QUEUE_WAIT_TIMEOUT_SECONDS = max(1, int(os.getenv("QUEUE_WAIT_TIMEOUT_SECONDS", "110")))
CHINA_TIMEZONE = timezone(timedelta(hours=8))

app = FastAPI(title="Journal Collage Rembg API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_session = None
_admission_slots = asyncio.BoundedSemaphore(PROCESSING_CONCURRENCY + MAX_QUEUE_SIZE)
_processing_slots = asyncio.BoundedSemaphore(PROCESSING_CONCURRENCY)


async def acquire_processing_slot():
    try:
        await asyncio.wait_for(_admission_slots.acquire(), timeout=0.05)
    except TimeoutError:
        raise HTTPException(status_code=429, detail="queue_full") from None

    try:
        await asyncio.wait_for(
            _processing_slots.acquire(),
            timeout=QUEUE_WAIT_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        _admission_slots.release()
        raise HTTPException(status_code=503, detail="queue_wait_timeout") from None


def release_processing_slot():
    _processing_slots.release()
    _admission_slots.release()


def initialize_rate_limit_db():
    Path(RATE_LIMIT_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(RATE_LIMIT_DB_PATH) as database:
        database.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_usage (
                user_id TEXT NOT NULL,
                usage_day TEXT NOT NULL,
                request_count INTEGER NOT NULL,
                PRIMARY KEY (user_id, usage_day)
            )
            """
        )
        database.execute(
            """
            CREATE TABLE IF NOT EXISTS minute_usage (
                user_id TEXT NOT NULL,
                usage_minute TEXT NOT NULL,
                request_count INTEGER NOT NULL,
                PRIMARY KEY (user_id, usage_minute)
            )
            """
        )


def reserve_request_quota(user_id: str):
    if DAILY_REQUEST_LIMIT == 0 and MINUTE_REQUEST_LIMIT == 0:
        return

    now = datetime.now(CHINA_TIMEZONE)
    usage_day = now.strftime("%Y-%m-%d")
    usage_minute = now.strftime("%Y-%m-%dT%H:%M")

    try:
        with sqlite3.connect(RATE_LIMIT_DB_PATH, timeout=5) as database:
            database.execute("PRAGMA busy_timeout = 5000")
            database.execute("BEGIN IMMEDIATE")

            if DAILY_REQUEST_LIMIT:
                row = database.execute(
                    "SELECT request_count FROM daily_usage WHERE user_id = ? AND usage_day = ?",
                    (user_id, usage_day),
                ).fetchone()
                if row and row[0] >= DAILY_REQUEST_LIMIT:
                    raise HTTPException(status_code=429, detail="daily_limit_exceeded")

            if MINUTE_REQUEST_LIMIT:
                row = database.execute(
                    "SELECT request_count FROM minute_usage WHERE user_id = ? AND usage_minute = ?",
                    (user_id, usage_minute),
                ).fetchone()
                if row and row[0] >= MINUTE_REQUEST_LIMIT:
                    raise HTTPException(status_code=429, detail="minute_limit_exceeded")

            if DAILY_REQUEST_LIMIT:
                database.execute(
                    """
                    INSERT INTO daily_usage (user_id, usage_day, request_count) VALUES (?, ?, 1)
                    ON CONFLICT(user_id, usage_day)
                    DO UPDATE SET request_count = request_count + 1
                    """,
                    (user_id, usage_day),
                )
            if MINUTE_REQUEST_LIMIT:
                database.execute(
                    """
                    INSERT INTO minute_usage (user_id, usage_minute, request_count) VALUES (?, ?, 1)
                    ON CONFLICT(user_id, usage_minute)
                    DO UPDATE SET request_count = request_count + 1
                    """,
                    (user_id, usage_minute),
                )

            database.execute(
                "DELETE FROM daily_usage WHERE usage_day < ?",
                ((now - timedelta(days=2)).strftime("%Y-%m-%d"),),
            )
            database.execute(
                "DELETE FROM minute_usage WHERE usage_minute < ?",
                ((now - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M"),),
            )
    except sqlite3.Error as error:
        raise HTTPException(status_code=503, detail="rate_limit_unavailable") from error


initialize_rate_limit_db()


def get_session():
    global _session
    if _session is None:
        from rembg import new_session

        _session = new_session(MODEL_NAME)
    return _session


def decode_base64_url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def require_user(authorization: str | None = Header(default=None)) -> str:
    if not AUTH_SECRET:
        raise HTTPException(status_code=503, detail="auth_not_configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing_auth_token")

    try:
        encoded_payload, signature = authorization[7:].split(".", 1)
        expected = hmac.new(
            AUTH_SECRET.encode("utf-8"),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        supplied = decode_base64_url(signature)
        if not hmac.compare_digest(expected, supplied):
            raise ValueError("invalid_signature")
        payload = json.loads(decode_base64_url(encoded_payload))
        if payload.get("aud") != "rembg-api" or int(payload.get("exp", 0)) <= time.time():
            raise ValueError("expired_token")
        user_id = payload.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise ValueError("missing_subject")
        return user_id
    except (ValueError, TypeError, UnicodeDecodeError, binascii.Error, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="invalid_auth_token") from None


def normalize_image(source: bytes) -> bytes:
    try:
        image = Image.open(BytesIO(source))
        image = ImageOps.exif_transpose(image).convert("RGBA")
    except Exception as error:
        raise HTTPException(status_code=400, detail="invalid_image") from error

    width, height = image.size
    longest = max(width, height)
    if longest > MAX_IMAGE_SIDE:
        scale = MAX_IMAGE_SIDE / longest
        image = image.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            Image.Resampling.LANCZOS,
        )

    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def remove_background(normalized: bytes) -> bytes:
    from rembg import remove

    return remove(
        normalized,
        session=get_session(),
        force_return_bytes=True,
        # Recompute mixed white-background edge pixels for clean transparent PNGs.
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=8,
        post_process_mask=True,
    )


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME}


@app.post("/remove-bg")
async def remove_bg(
    file: UploadFile = File(None),
    image: UploadFile = File(None),
    user_id: str = Depends(require_user),
):
    reserve_request_quota(user_id)
    upload = file or image
    if upload is None:
        raise HTTPException(status_code=400, detail="missing_image_file")

    source = await upload.read()
    if len(source) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="image_too_large")

    normalized = normalize_image(source)

    try:
        await acquire_processing_slot()
        try:
            result = await asyncio.to_thread(remove_background, normalized)
        finally:
            release_processing_slot()
    except Exception as error:
        if isinstance(error, HTTPException):
            raise error
        raise HTTPException(status_code=500, detail="remove_bg_failed") from error

    encoded = base64.b64encode(result).decode("ascii")
    return {
        "ok": True,
        "base64": f"data:image/png;base64,{encoded}",
    }

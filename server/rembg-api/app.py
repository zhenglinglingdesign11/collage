import base64
import binascii
import hashlib
import hmac
import json
import os
import time
from io import BytesIO

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps


MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
MAX_IMAGE_SIDE = int(os.getenv("MAX_IMAGE_SIDE", "1800"))
MODEL_NAME = os.getenv("REMBG_MODEL", "u2net")
AUTH_SECRET = os.getenv("REMBG_AUTH_SECRET", "")

app = FastAPI(title="Journal Collage Rembg API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_session = None


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


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME}


@app.post("/remove-bg")
async def remove_bg(
    file: UploadFile = File(None),
    image: UploadFile = File(None),
    # Temporary network troubleshooting: accept requests without an OpenID/HMAC token.
    # user_id: str = Depends(require_user),
):
    upload = file or image
    if upload is None:
        raise HTTPException(status_code=400, detail="missing_image_file")

    source = await upload.read()
    if len(source) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="image_too_large")

    normalized = normalize_image(source)

    try:
        from rembg import remove

        result = remove(
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
    except Exception as error:
        raise HTTPException(status_code=500, detail="remove_bg_failed") from error

    encoded = base64.b64encode(result).decode("ascii")
    return {
        "ok": True,
        "base64": f"data:image/png;base64,{encoded}",
    }

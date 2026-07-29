import base64
import os
from io import BytesIO

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps


MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
MAX_IMAGE_SIDE = int(os.getenv("MAX_IMAGE_SIDE", "1800"))
MODEL_NAME = os.getenv("REMBG_MODEL", "u2net")

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
async def remove_bg(file: UploadFile = File(None), image: UploadFile = File(None)):
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

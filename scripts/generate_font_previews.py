import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
FONT_TABLE = ROOT / "miniprogram-spike" / "miniprogram" / "config" / "font-table.js"
OUTPUT_DIR = ROOT / "miniprogram-spike" / "miniprogram" / "assets" / "font-previews"
FONT_SOURCE_DIRS = [
    ROOT / "source-assets" / "fonts-dist",
    ROOT / "source-assets" / "fonts",
]
CANVAS_SIZE = (320, 96)
PREVIEW_TEXT_OVERRIDES = {
    "kurewa_gothic_regular": "手体",
}


def parse_font_table():
    content = FONT_TABLE.read_text(encoding="utf-8")
    entries = []
    for block in re.findall(r"\{\s*id:[\s\S]*?\n\s*\}", content):
        def get_string(name):
            match = re.search(rf'{name}:\s*"([^"]*)"', block)
            return match.group(1) if match else ""

        font_id = get_string("id")
        file_name = get_string("fileName")
        preview_text = get_string("previewText")
        if font_id and file_name:
            entries.append({
                "id": font_id,
                "fileName": file_name,
                "previewText": preview_text or font_id
            })
    return entries


def find_local_font(entry):
    file_name = entry["fileName"]
    candidates = []
    for source_dir in FONT_SOURCE_DIRS:
        candidates.extend(source_dir.rglob(file_name))
        stem = Path(file_name).stem
        suffix = Path(file_name).suffix
        if "-gb2312" in stem:
            candidates.extend(source_dir.rglob(f"{stem.replace('-gb2312', '-subset')}{suffix}"))
        candidates.extend(source_dir.rglob(f"{stem}{suffix}"))
    valid = [item for item in candidates if item.exists() and item.stat().st_size > 0]
    if not valid:
        raise FileNotFoundError(f"missing local font: {file_name}")
    valid.sort(key=lambda item: (0 if "fonts-dist" in str(item) else 1, len(str(item))))
    return valid[0]


def fit_font(font_path, text):
    for size in range(48, 15, -2):
        font = ImageFont.truetype(str(font_path), size=size)
        bbox = ImageDraw.Draw(Image.new("RGBA", CANVAS_SIZE)).textbbox((0, 0), text, font=font)
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        if width <= CANVAS_SIZE[0] - 36 and height <= CANVAS_SIZE[1] - 24:
            return font, bbox
    font = ImageFont.truetype(str(font_path), size=16)
    bbox = ImageDraw.Draw(Image.new("RGBA", CANVAS_SIZE)).textbbox((0, 0), text, font=font)
    return font, bbox


def render_preview(entry, font_path):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", CANVAS_SIZE, (255, 255, 255, 0))
    draw = ImageDraw.Draw(image)
    text = PREVIEW_TEXT_OVERRIDES.get(entry["id"], entry["previewText"])
    font, bbox = fit_font(font_path, text)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    x = (CANVAS_SIZE[0] - width) / 2 - bbox[0]
    y = (CANVAS_SIZE[1] - height) / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=(17, 17, 17, 255))
    image.save(OUTPUT_DIR / f"{entry['id']}.png")


def main():
    entries = parse_font_table()
    generated = []
    for entry in entries:
        font_path = find_local_font(entry)
        render_preview(entry, font_path)
        generated.append(entry["id"])
    print(json.dumps(generated, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

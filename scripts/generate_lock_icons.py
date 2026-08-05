from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "miniprogram-spike" / "miniprogram" / "assets" / "icons" / "layer-actions"
SIZE = 96
SCALE = SIZE / 24
COLOR = (95, 95, 95, 255)


def s(value):
    return int(round(value * SCALE))


def draw_lock(draw, locked):
    stroke = max(4, s(1.5))
    # Body
    draw.rounded_rectangle(
        [s(4.5), s(10.0), s(19.5), s(21.0)],
        radius=s(1.2),
        outline=COLOR,
        width=stroke
    )
    if locked:
        draw.arc(
            [s(8.0), s(3.0), s(16.0), s(13.0)],
            start=180,
            end=360,
            fill=COLOR,
            width=stroke
        )
        draw.line([s(8.0), s(8.0), s(8.0), s(10.0)], fill=COLOR, width=stroke)
        draw.line([s(16.0), s(8.0), s(16.0), s(10.0)], fill=COLOR, width=stroke)
        draw.ellipse([s(10.7), s(14.0), s(13.3), s(16.6)], fill=COLOR)
    else:
        draw.arc(
            [s(8.0), s(2.4), s(17.5), s(12.6)],
            start=180,
            end=360,
            fill=COLOR,
            width=stroke
        )
        draw.line([s(8.0), s(7.6), s(8.0), s(10.0)], fill=COLOR, width=stroke)
        draw.line([s(17.5), s(7.6), s(17.5), s(9.0)], fill=COLOR, width=stroke)
        draw.rounded_rectangle(
            [s(11.25), s(13.0), s(12.75), s(18.5)],
            radius=s(0.7),
            fill=COLOR
        )


def save_icon(name, locked):
    image = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
    draw = ImageDraw.Draw(image)
    draw_lock(draw, locked)
    image.save(OUT_DIR / name)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    save_icon("lock-outline.png", True)
    save_icon("unlock-outline.png", False)


if __name__ == "__main__":
    main()

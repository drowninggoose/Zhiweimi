from pathlib import Path
from PIL import Image, ImageDraw
import math


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "public" / "mascot" / "set-01"
OUTPUT_DIR = ROOT / "public" / "mascot" / "motion-v3"
CANVAS = 512
FPS = 24
FRAME_COUNT = 32
RUST = (157, 80, 51)
RED = (184, 35, 42)
CREAM = (255, 239, 213)


def star(draw: ImageDraw.ImageDraw, x: float, y: float, radius: float, color: tuple[int, int, int, int]) -> None:
    points = []
    for index in range(8):
        angle = math.pi / 4 * index
        distance = radius if index % 2 == 0 else radius * 0.22
        points.append((x + math.cos(angle) * distance, y + math.sin(angle) * distance))
    draw.polygon(points, fill=color)


def decorate(frame: Image.Image, phase: float, variant: int) -> None:
    draw = ImageDraw.Draw(frame, "RGBA")
    anchors = [
        (74, 114, 11, RED),
        (438, 147, 8, RUST),
        (90, 389, 7, RUST),
        (421, 363, 10, RED),
    ]
    for index, (x, y, size, color) in enumerate(anchors):
        local = phase + index * 1.33 + variant * 0.37
        pulse = (math.sin(local) + 1) / 2
        alpha = round(38 + 178 * pulse)
        drift = math.sin(local * 0.7) * 9
        star(draw, x + drift, y - pulse * 10, size * (0.55 + pulse * 0.45), (*color, alpha))
    # Tiny bubbles give the loop more life without competing with the illustration.
    for index in range(3):
        local = (phase / (2 * math.pi) + index / 3 + variant * 0.11) % 1
        x = 118 + index * 138 + math.sin(phase + index) * 11
        y = 432 - local * 312
        radius = 3 + index
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*CREAM, round(120 * (1 - local))))


def create_animation(source: Path, variant: int) -> None:
    original = Image.open(source).convert("RGBA")
    bbox = original.getchannel("A").getbbox()
    if bbox:
        original = original.crop(bbox)
    ratio = min(426 / original.width, 426 / original.height)
    base = original.resize(
        (max(1, round(original.width * ratio)), max(1, round(original.height * ratio))),
        Image.Resampling.LANCZOS,
    )

    frames: list[Image.Image] = []
    phase_offset = variant * 0.41
    for index in range(FRAME_COUNT):
        phase = 2 * math.pi * index / FRAME_COUNT + phase_offset
        bounce = math.sin(phase)
        secondary = math.sin(phase * 2)
        scale_x = 1 + 0.018 * bounce
        scale_y = 1 - 0.014 * bounce + 0.006 * secondary
        angle = 1.45 * math.sin(phase + 0.35)
        bob = round(9 * math.sin(phase))
        transformed = base.resize(
            (round(base.width * scale_x), round(base.height * scale_y)),
            Image.Resampling.LANCZOS,
        ).rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)

        frame = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        decorate(frame, phase, variant)
        x = (CANVAS - transformed.width) // 2 + round(3 * secondary)
        y = (CANVAS - transformed.height) // 2 + bob
        frame.alpha_composite(transformed, (x, y))
        frames.append(frame)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT_DIR / f"{source.stem}.webp"
    frames[0].save(
        destination,
        save_all=True,
        append_images=frames[1:],
        duration=round(1000 / FPS),
        loop=0,
        quality=79,
        # Fast WebP encoding keeps the asset pipeline practical; playback
        # smoothness comes from the 25fps frame cadence, not encoder effort.
        method=2,
        lossless=False,
        exact=True,
    )
    print(f"created {destination.name}")


for number, png in enumerate(sorted(SOURCE_DIR.glob("*.png"))):
    create_animation(png, number)

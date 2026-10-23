from pathlib import Path
from PIL import Image
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SHEET_DIR = ROOT / "public" / "mascot" / "action-sheets-v4"
OUTPUT_DIR = ROOT / "public" / "mascot" / "motion-v4"
FRAME_SIZE = 512
TWEENS = 4
FRAME_DURATION_MS = 42  # ~24fps


def premultiplied_blend(first: Image.Image, second: Image.Image, amount: float) -> Image.Image:
    a = np.asarray(first, dtype=np.float32) / 255.0
    b = np.asarray(second, dtype=np.float32) / 255.0
    alpha_a = a[..., 3:4]
    alpha_b = b[..., 3:4]
    out_alpha = alpha_a * (1 - amount) + alpha_b * amount
    out_rgb_premultiplied = a[..., :3] * alpha_a * (1 - amount) + b[..., :3] * alpha_b * amount
    out_rgb = np.divide(
        out_rgb_premultiplied,
        out_alpha,
        out=np.zeros_like(out_rgb_premultiplied),
        where=out_alpha > 0.0001,
    )
    out = np.concatenate((out_rgb, out_alpha), axis=-1)
    return Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8), "RGBA")


def extract_keyframes(sheet: Image.Image) -> list[Image.Image]:
    width, height = sheet.size
    frames: list[Image.Image] = []
    for row in range(2):
        for column in range(4):
            left = round(column * width / 4)
            right = round((column + 1) * width / 4)
            top = round(row * height / 2)
            bottom = round((row + 1) * height / 2)
            cell = sheet.crop((left, top, right, bottom)).convert("RGBA")
            cell = cell.resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)
            frames.append(cell)
    return frames


def animate(sheet_path: Path) -> None:
    keyframes = extract_keyframes(Image.open(sheet_path))
    frames: list[Image.Image] = []
    for index, current in enumerate(keyframes):
        following = keyframes[(index + 1) % len(keyframes)]
        for tween in range(TWEENS):
            frames.append(premultiplied_blend(current, following, tween / TWEENS))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT_DIR / f"{sheet_path.stem}.webp"
    frames[0].save(
        destination,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        quality=82,
        method=2,
        lossless=False,
        exact=True,
    )
    print(f"created {destination.name}: {len(frames)} frames")


for sprite_sheet in sorted(SHEET_DIR.glob("*.png")):
    animate(sprite_sheet)

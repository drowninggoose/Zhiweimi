from pathlib import Path
from PIL import Image
import math


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "public" / "mascot" / "set-01"
CANVAS_SIZE = 512
FRAME_COUNT = 12


def gif_frame(rgba: Image.Image) -> Image.Image:
    """Reserve palette index 0 for transparency on every frame.

    Letting Pillow choose the transparent index independently can make browsers
    briefly paint cleared GIF frames with the palette's black entry.
    """
    rgb = Image.new("RGB", rgba.size, (255, 255, 255))
    rgb.paste(rgba.convert("RGB"), mask=rgba.getchannel("A"))
    quantized = rgb.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    shifted = quantized.point(lambda value: value + 1)
    palette = quantized.getpalette()[: 255 * 3]
    shifted.putpalette([255, 255, 255] + palette)
    transparent_pixels = rgba.getchannel("A").point(lambda value: 255 if value < 16 else 0)
    shifted.paste(0, mask=transparent_pixels)
    shifted.info["transparency"] = 0
    return shifted


def create_gif(source: Path) -> None:
    original = Image.open(source).convert("RGBA")
    alpha = original.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        original = original.crop(bbox)

    max_side = 438
    ratio = min(max_side / original.width, max_side / original.height)
    base = original.resize(
        (max(1, round(original.width * ratio)), max(1, round(original.height * ratio))),
        Image.Resampling.LANCZOS,
    )

    frames: list[Image.Image] = []
    for index in range(FRAME_COUNT):
        phase = 2 * math.pi * index / FRAME_COUNT
        scale = 1 + 0.012 * math.sin(phase)
        angle = 1.2 * math.sin(phase)
        bob = round(6 * math.sin(phase))
        resized = base.resize(
            (round(base.width * scale), round(base.height * scale)),
            Image.Resampling.LANCZOS,
        )
        animated = resized.rotate(
            angle,
            resample=Image.Resampling.BICUBIC,
            expand=True,
        )
        frame = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
        x = (CANVAS_SIZE - animated.width) // 2
        y = (CANVAS_SIZE - animated.height) // 2 + bob
        frame.alpha_composite(animated, (x, y))
        frames.append(gif_frame(frame))

    destination = source.with_suffix(".gif")
    frames[0].save(
        destination,
        save_all=True,
        append_images=frames[1:],
        duration=105,
        loop=0,
        # Keep the previous complete frame while the next one is decoded. This
        # avoids browser-specific black flashes caused by "restore background".
        disposal=1,
        transparency=0,
        background=0,
        optimize=False,
    )
    print(f"created {destination.name}")


for png in sorted(SOURCE_DIR.glob("*.png")):
    create_gif(png)

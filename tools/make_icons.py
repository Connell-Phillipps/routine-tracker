"""Draws the app icons (original fire/water creature mark) into icons/. Needs Pillow."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
BG = (18, 19, 28, 255)
WARM = (255, 122, 61, 255)
COOL = (61, 139, 255, 255)
CREAM = (255, 244, 230, 255)
INK = (27, 27, 47, 255)
SCALE = 4  # draw large, then downsample for smooth edges


def draw_mark(size: int, safe: float) -> Image.Image:
    """Creature face: split warm/cool body, drop crest, eyes. `safe` shrinks it for maskable."""
    s = size * SCALE
    img = Image.new("RGBA", (s, s), BG)
    d = ImageDraw.Draw(img)
    r = s * 0.32 * safe
    cx, cy = s / 2, s * 0.56
    box = (cx - r, cy - r, cx + r, cy + r)
    d.pieslice(box, 90, 270, fill=WARM)
    d.pieslice(box, 270, 90, fill=COOL)
    d.ellipse((cx - r * 0.55, cy, cx + r * 0.55, cy + r * 0.85), fill=CREAM)
    # drop crest
    top = cy - r * 1.55
    d.polygon([(cx, top), (cx - r * 0.28, cy - r * 0.95), (cx + r * 0.28, cy - r * 0.95)], fill=(127, 212, 255, 255))
    d.ellipse((cx - r * 0.28, cy - r * 1.2, cx + r * 0.28, cy - r * 0.68), fill=(127, 212, 255, 255))
    # eyes
    for ex in (cx - r * 0.38, cx + r * 0.38):
        er = r * 0.17
        d.ellipse((ex - er, cy - r * 0.4 - er, ex + er, cy - r * 0.4 + er), fill=(255, 255, 255, 255))
        pr = er * 0.55
        d.ellipse((ex - pr, cy - r * 0.38 - pr, ex + pr, cy - r * 0.38 + pr), fill=INK)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    draw_mark(192, 1.0).save(OUT / "icon-192.png")
    draw_mark(512, 1.0).save(OUT / "icon-512.png")
    draw_mark(512, 0.78).save(OUT / "icon-maskable-512.png")
    draw_mark(180, 1.0).convert("RGB").save(OUT / "apple-touch-icon.png")  # iOS wants no alpha
    print("Icons written to", OUT)


if __name__ == "__main__":
    main()

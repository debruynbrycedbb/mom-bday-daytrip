"""Prepare the site images from the original artwork folder.

Usage:
    python3 tools/prepare_images.py "/path/to/Mom bday vid"

Needs Pillow (pip install pillow). Writes into assets/img/.
- Characters: removes the white background, crops, and makes a large
  sprite (title card, final scene) and a tiny map sprite.
- Scenes: resizes to the low resolution the scene canvases draw at,
  so the code-made pixel effects line up with the artwork.
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageEnhance

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "../../Mom bday vid")
OUT = Path(__file__).resolve().parent.parent / "assets" / "img"
OUT.mkdir(parents=True, exist_ok=True)

# name in folder -> (output name, large height, map height)
CHARACTERS = {
    "mom pixel.png": ("mom", 96, 32),
    "dad pixel.png": ("dad", 96, 32),
    "dog 1 pixel.png": ("dog1", 48, 13),
    "dog 2 pixel.png": ("dog2", 48, 13),
}

# name in folder -> (output name, width, height)
SCENES = {
    "walking street.png": ("scene-street", 320, 480),
    "lucca square.png": ("scene-square", 320, 400),
    "car drive.png": ("scene-drive", 480, 270),
    "bath tub.png": ("scene-baths", 480, 360),
}


def is_background(px):
    r, g, b = px[:3]
    return min(r, g, b) > 218 and max(r, g, b) - min(r, g, b) < 28


def remove_background(img):
    """Flood fill from the borders, turning near-white pixels transparent."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_background(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    return img.crop(img.getbbox())


def shrink(img, height):
    w = max(1, round(img.width * height / img.height))
    small = img.convert("RGBa").resize((w, height), Image.BOX).convert("RGBA")
    # Hard pixel edges: alpha is either fully on or off.
    px = small.load()
    for y in range(small.height):
        for x in range(small.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255 if a >= 120 else 0)
    return small


def outline(img, colour=(42, 26, 20, 255)):
    """Add a 1px dark outline around the sprite so it reads on the map."""
    w, h = img.size
    out = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    out.paste(img, (1, 1), img)
    src = out.copy().load()
    o = out.load()
    for y in range(h + 2):
        for x in range(w + 2):
            if src[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < w + 2 and 0 <= yy < h + 2 and src[xx, yy][3]:
                    o[x, y] = colour
                    break
    return out


for src_name, (name, big_h, map_h) in CHARACTERS.items():
    cut = remove_background(Image.open(SRC / src_name))
    big = shrink(cut, big_h)
    big.save(OUT / f"{name}.png", optimize=True)
    small = ImageEnhance.Contrast(shrink(big, map_h)).enhance(1.15)
    outline(small).save(OUT / f"{name}-map.png", optimize=True)
    print("character", name, cut.size)

for src_name, (name, w, h) in SCENES.items():
    img = Image.open(SRC / src_name).convert("RGB")
    # Crop to the target aspect ratio (centre), then resize.
    target = w / h
    if img.width / img.height > target:
        nw = round(img.height * target)
        img = img.crop(((img.width - nw) // 2, 0, (img.width - nw) // 2 + nw, img.height))
    else:
        nh = round(img.width / target)
        img = img.crop((0, (img.height - nh) // 2, img.width, (img.height - nh) // 2 + nh))
    small = img.resize((w, h), Image.LANCZOS)
    small.save(OUT / f"{name}.png", optimize=True)
    print("scene", name, small.size)

# Park and countryside trees, to scale with the family (people are 34px tall,
# so these are roughly 6-7 m tall). Already transparent.
import colorsys


def olive(img):
    """Recolour the leaves silvery grey-green, like an olive tree."""
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, l, sat = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if 0.12 < h < 0.45 and g >= r * 0.8:  # leaves, not trunk
                h, sat, l = 0.22, sat * 0.42, min(1, l * 1.04 + 0.03)
                r2, g2, b2 = colorsys.hls_to_rgb(h, l, sat)
                px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return out


for i in (1, 2, 3):
    tree = Image.open(SRC / f"tree {i}.png").convert("RGBA")
    tree = tree.crop(tree.getbbox())
    for tag, h in (("l", 140), ("m", 118)):
        shrink(tree, h).save(OUT / f"tree{i}-{tag}.png", optimize=True)
    olive(shrink(tree, 86)).save(OUT / f"olive{i}.png", optimize=True)
    print("tree", i)

# The lizard is drawn in code (js/sprites.js) in the colours of lizard.png:
# at its true size (about 12px) a shrunk copy of the artwork turns to mush.

# Social preview image
og = Image.open(SRC / "car drive.png").convert("RGB")
og = og.resize((1200, round(1200 * og.height / og.width)), Image.LANCZOS)
og = og.crop((0, (og.height - 630) // 2, 1200, (og.height - 630) // 2 + 630))
og.save(OUT / "og-image.jpg", quality=82, optimize=True)
print("og image done")

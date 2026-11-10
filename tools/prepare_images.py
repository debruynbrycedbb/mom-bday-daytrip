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

# Park and countryside trees, to scale with the family (people are 16px tall,
# about 9px to the metre, so these are roughly 6-7 m tall). Already transparent.
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
    for tag, h in (("l", 64), ("m", 54)):
        ImageEnhance.Contrast(shrink(tree, h)).enhance(1.12).save(OUT / f"tree{i}-{tag}.png", optimize=True)
    olive(ImageEnhance.Contrast(shrink(tree, 40)).enhance(1.12)).save(OUT / f"olive{i}.png", optimize=True)
    print("tree", i)

# The lizard is drawn in code (js/sprites.js) in the colours of lizard.png:
# at its true size (about 12px) a shrunk copy of the artwork turns to mush.

def make_cutscene(src, out):
    """Split the car picture into layers for the drive cutscene:
    the scenery is removed (a scrolling background is drawn in code), the
    dogs are lifted out as sprites (the back seat is painted in behind them),
    Mom's and Dad's heads become separate layers so they can bob, and a
    front layer keeps the dogs behind Mom, Dad and the seat edge."""
    W, H = 480, 270
    OUT = out
    im = Image.open(src).convert("RGB").resize((W, H), Image.BOX)
    px = im.load()

    # Scenery is removed by filling outwards from the open sky and the view
    # through the windscreen. The fill stops at dark outlines, so the car,
    # Mom's hat and the frame's cream highlight can never be eaten into.
    def passable(x, y):
        r, g, b = px[x, y]
        if g > r + 6 and b < g + 15 and r + g + b >= 140: return True  # hills and dark trees
        if r + g + b < 300: return False                       # outlines and shadows
        if b > 140 and b > r + 25: return True                 # sky
        if y < 46 and min(r, g, b) > 195: return True          # clouds above the frame
        if y < 60 and min(r, g, b) > 190 and b >= r: return True  # blue-white cloud
        if r > 150 and g > 140 and b < 120 and abs(r - g) < 45: return True  # sunny fields
        return False

    bg = [[False] * H for _ in range(W)]
    q = deque([(x, 0) for x in range(W)] + [(0, y) for y in range(140)] + [(W - 1, y) for y in range(140)])
    # also start from every pixel that can only be scenery: clear blue sky or
    # strong green (the car and the family have neither)
    for x in range(W):
        for y in range(170):
            r, g, b = px[x, y]
            if (b > 200 and b > r + 50) or (g > r + 15 and g > b + 15): q.append((x, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= W or y >= H or bg[x][y] or not passable(x, y): continue
        bg[x][y] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    # the tree in the top-left corner above the windscreen frame is scenery too
    frame = [(0, 97), (20, 84), (40, 73), (60, 65), (80, 60), (110, 56), (140, 54)]
    def above_frame(x, y):
        for (x0, y0), (x1, y1) in zip(frame, frame[1:]):
            if x0 <= x <= x1:
                return y < y0 + (y1 - y0) * (x - x0) / (x1 - x0) - 2
        return False
    for x in range(140):
        for y in range(100):
            if above_frame(x, y): bg[x][y] = True

    # floating scraps (dark trees in the hills, a sliver of cloud): any small
    # island of picture left in the scenery area goes too
    seen = [[False] * H for _ in range(W)]
    for sx in range(W):
        for sy in range(185):
            if bg[sx][sy] or seen[sx][sy]: continue
            comp, q = [], deque([(sx, sy)])
            seen[sx][sy] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for xx, yy in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= xx < W and 0 <= yy < H and not bg[xx][yy] and not seen[xx][yy]:
                        seen[xx][yy] = True
                        q.append((xx, yy))
            if len(comp) < 300 and max(y for _, y in comp) < 185:
                for x, y in comp: bg[x][y] = True

    # dogs: warm fur, tongue, then outlines and enclosed holes
    DOGS = {"dog1": (191, 99, 238, 154), "dog2": (239, 99, 296, 154)}
    dogmask = {}
    for name, (x0, y0, x1, y1) in DOGS.items():
        m = set()
        for x in range(x0, x1):
            for y in range(y0, y1):
                r, g, b = px[x, y]
                if (r > g + 15 and r > b + 40) or (r > 190 and g < 140 and b > 100):
                    m.add((x, y))
        for _ in range(2):  # grow to take in the dark outline
            grow = set(m)
            for (x, y) in m:
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    xx, yy = x + dx, y + dy
                    if x0 <= xx < x1 and y0 <= yy < y1 and sum(px[xx, yy]) < 260: grow.add((xx, yy))
            m = grow
        # fill holes (eyes, nose): anything not reachable from the box edge
        outside = set(); q = deque()
        for x in range(x0, x1): q.extend(((x, y0), (x, y1 - 1)))
        for y in range(y0, y1): q.extend(((x0, y), (x1 - 1, y)))
        while q:
            p = q.popleft()
            x, y = p
            if p in outside or p in m or not (x0 <= x < x1 and y0 <= y < y1): continue
            outside.add(p)
            q.extend(((x+1,y),(x-1,y),(x,y+1),(x,y-1)))
        m = {(x, y) for x in range(x0, x1) for y in range(y0, y1) if (x, y) not in outside}
        dogmask[name] = m

    # the dogs as sprites
    for name, m in dogmask.items():
        xs = [p[0] for p in m]; ys = [p[1] for p in m]
        bx0, by0, bx1, by1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
        spr = Image.new("RGBA", (bx1 - bx0, by1 - by0), (0, 0, 0, 0))
        for (x, y) in m: spr.putpixel((x - bx0, y - by0), px[x, y] + (255,))
        spr.save(f"{OUT}/cut-{name}.png")
        print(name, "at", bx0, by0, "size", spr.size)

    # the car layer: scenery out, dogs painted over with the back-seat colour
    car = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cp = car.load()
    alldog = dogmask["dog1"] | dogmask["dog2"]
    # the back seat behind the dogs: each row's typical dark upholstery colour
    seat_row = {}
    for y in range(H):
        dark = sorted((px[x, y] for x in range(180, 310)
                       if (x, y) not in alldog and not bg[x][y] and sum(px[x, y]) < 330 and not px[x, y][0] > px[x, y][1] + 15),
                      key=sum)
        seat_row[y] = dark[len(dark) // 2] if dark else (58, 56, 64)
    for y in range(H):
        for x in range(W):
            if bg[x][y]: continue
            if (x, y) in alldog:
                cp[x, y] = seat_row[y] + (255,)
            else:
                cp[x, y] = px[x, y] + (255,)

    HEADS = {"mom": (64, 76, 202, 157), "dad": (295, 74, 367, 149)}
    for name, box in HEADS.items():
        head = car.crop(box)
        head.save(f"{OUT}/cut-{name}.png")
        for y in range(box[1], box[3]):
            for x in range(box[0], box[2]): cp[x, y] = (0, 0, 0, 0)
        print(name, "head at", box[0], box[1])
    car.save(f"{OUT}/cut-car.png")

    # the front layer: everything that should pass in front of the dogs
    front = car.copy()
    fp = front.load()
    WIN = (198, 101, 296, 151)
    for y in range(H):
        for x in range(W):
            if (WIN[0] <= x < WIN[2] and WIN[1] <= y < WIN[3]) or (x, y) in alldog:
                fp[x, y] = (0, 0, 0, 0)
    front.save(f"{OUT}/cut-front.png")
    print("done")


make_cutscene(SRC / "car drive.png", OUT)

# Side views of the dogs, for poking their heads out of the car
for src_name, name in (("dog 1 pixel.png", "cut-dog1-side"), ("dog 2 pixel.png", "cut-dog2-side")):
    shrink(remove_background(Image.open(SRC / src_name)), 92).save(OUT / f"{name}.png", optimize=True)
    print("side view", name)

# Social preview image
og = Image.open(SRC / "car drive.png").convert("RGB")
og = og.resize((1200, round(1200 * og.height / og.width)), Image.LANCZOS)
og = og.crop((0, (og.height - 630) // 2, 1200, (og.height - 630) // 2 + 630))
og.save(OUT / "og-image.jpg", quality=82, optimize=True)
print("og image done")

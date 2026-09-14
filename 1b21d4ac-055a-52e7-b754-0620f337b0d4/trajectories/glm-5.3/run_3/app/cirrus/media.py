"""Procedural media: stills, reels, grain tile, share image. No binary ships.

Every pixel is drawn from a stored seed. The grain tile and share image are
generated at first use and cached on disk (under static/gen) so a rebuild from
the image is unnecessary; a fresh container regenerates them identically.
"""
import colorsys
import hashlib
import io
import math
import os
import struct
import zlib

from PIL import Image, ImageDraw, ImageFilter

# The five generator colours, pinned by the front-end specification.
GEN_COLOURS = ["#313236", "#676767", "#333333", "#455e53", "#dedede"]

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "gen")

_mkdir_lock = None


def _ensure_cache_dir():
    os.makedirs(CACHE_DIR, exist_ok=True)


def _seed_int(seed: str) -> int:
    return int.from_bytes(hashlib.sha256(seed.encode()).digest()[:8], "big")


def _hex(s: str):
    return tuple(int(s[i : i + 2], 16) for i in (1, 3, 5))


def _lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def _gradient_pair(seed: str):
    n = _seed_int(seed)
    a = GEN_COLOURS[n % len(GEN_COLOURS)]
    b = GEN_COLOURS[(n // 5) % len(GEN_COLOURS)]
    if b == a:
        b = GEN_COLOURS[(n // 5 + 1) % len(GEN_COLOURS)]
    return _hex(a), _hex(b), n


def render_still(seed: str, width: int, height: int, desat: float = 0.0, grain: float = 0.5) -> bytes:
    """A gradient field with a low-strength cross gradient, grain and vignette.

    Deterministic per seed. The gradient is produced with Pillow ops so a
    full-size still renders in a few milliseconds on modest hardware.
    """
    width = max(1, min(int(width or 600), 2400))
    height = max(1, min(int(height or 400), 2400))
    c1, c2, n = _gradient_pair(seed)
    angle1 = (n % 360) if n else 0
    angle2 = (angle1 + 40 + (n >> 7) % 140) % 360

    # --- the primary linear gradient, rotated to its seed angle -------------
    diag = math.hypot(width, height)
    base = Image.new("RGB", (width, height))
    d = ImageDraw.Draw(base)
    cx, cy = width / 2.0, height / 2.0
    for t in range(0, 101, 2):
        col = _lerp(c1, c2, t / 100.0)
        r = diag
        a = math.radians(angle1)
        px = cx + math.cos(a) * r * (t / 100.0 - 0.5)
        py = cy + math.sin(a) * r * (t / 100.0 - 0.5)
        # draw a wide line at the offset for this stop so the ramp is smooth
        nx, ny = -math.sin(a), math.cos(a)
        d.line([(px - nx * diag, py - ny * diag), (px + nx * diag, py + ny * diag)],
               fill=col, width=max(2, int(diag * 0.02)))
    base = base.filter(ImageFilter.GaussianBlur(radius=max(2, diag / 90)))

    # --- a second gradient at a different angle, at low strength ------------
    overlay = Image.new("RGB", (width, height), _hex("#060403"))
    d2 = ImageDraw.Draw(overlay)
    for t in range(0, 101, 4):
        a2 = math.radians(angle2)
        px = cx + math.cos(a2) * diag * (t / 100.0 - 0.5)
        py = cy + math.sin(a2) * diag * (t / 100.0 - 0.5)
        nx, ny = -math.sin(a2), math.cos(a2)
        d2.line([(px - nx * diag, py - ny * diag), (px + nx * diag, py + ny * diag)],
                fill=_lerp(_hex("#060403"), _hex("#dedede"), t / 100.0),
                width=max(2, int(diag * 0.03)))
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=max(2, diag / 80)))
    base = Image.blend(base, overlay, 0.16)

    # --- a very slight vignette -------------------------------------------
    mask = Image.new("L", (width, height), 0)
    dm = ImageDraw.Draw(mask)
    steps = 24
    for i in range(steps, -1, -1):
        f = i / steps
        alpha = int(255 * (1 - f) * 0.16)
        rx, ry = width * (0.5 + f * 0.75), height * (0.5 + f * 0.75)
        dm.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255 - alpha)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(2, diag / 120)))
    dark = Image.new("RGB", (width, height), _hex("#060403"))
    base = Image.composite(base, Image.blend(base, dark, 0.16), mask)

    # --- the grain tile, composited at very low strength -------------------
    tile = grain_tile_image()
    tile_size = tile.size[0]
    rep_x = width // tile_size + 2
    rep_y = height // tile_size + 2
    tiled = Image.new("L", (rep_x * tile_size, rep_y * tile_size))
    for yy in range(rep_y):
        for xx in range(rep_x):
            tiled.paste(tile, (xx * tile_size, yy * tile_size))
    tiled = tiled.crop((0, 0, width, height))
    grain_rgb = Image.merge("RGB", (tiled, tiled, tiled))
    base = Image.blend(base, _blend_grain(base, grain_rgb), 0.5)

    if desat:
        base = _desaturate(base, desat)
    return encode_jpeg(base, quality=82)


def _blend_grain(base: Image.Image, grain_rgb: Image.Image) -> Image.Image:
    """Add the grain at very low strength: ±6 levels around the base."""
    from PIL import ImageChops

    low = ImageChops.multiply(grain_rgb, Image.new("RGB", base.size, (12, 12, 12)))
    return ImageChops.add(base, low)


def _desaturate(img: Image.Image, amount: float) -> Image.Image:
    grey = img.convert("L").convert("RGB")
    return Image.blend(img, grey, max(0.0, min(1.0, amount)))


def encode_jpeg(img: Image.Image, quality=82) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=False)
    return buf.getvalue()


def grain_tile_image(size=300, base_freq=0.9, octaves=4) -> Image.Image:
    path = os.path.join(CACHE_DIR, "grain-%d.png" % size)
    if os.path.exists(path):
        return Image.open(path).convert("L")
    _ensure_cache_dir()
    rng = _Random(0x9E3779B97F4A7C15)
    # Value noise summed over octaves at a base frequency near 0.9.
    w = size
    small = Image.new("L", (max(2, int(w * base_freq / 8)), max(2, int(w * base_freq / 8))))
    spx = small.load()
    for y in range(small.size[1]):
        for x in range(small.size[0]):
            spx[x, y] = rng.int(0, 255)
    acc = None
    cur = small
    for o in range(octaves):
        cur = cur.resize((w, w), Image.BILINEAR)
        if o > 0:
            cur = cur.filter(ImageFilter.GaussianBlur(1.2))
        if acc is None:
            acc = Image.new("L", (w, w))
        acc = Image.blend(acc, cur, 1.0 / (o + 1))
    # All colour removed; centred on no change and clipped to very low strength.
    lo, hi = acc.getextrema()
    if hi > lo:
        acc = acc.point(lambda v: int((v - lo) * 255 / (hi - lo)))
    acc.save(path, "PNG", optimize=True)
    return acc


class _Random:
    """Tiny deterministic PRNG (splitmix64) so the tile never changes."""

    def __setstate__(self, *a):
        pass

    def __init__(self, seed: int):
        self.s = seed & 0xFFFFFFFFFFFFFFFF

    def int(self, a=0, b=255):
        self.s = (self.s + 0x9E3779B97F4A7C15) & 0xFFFFFFFFFFFFFFFF
        z = self.s
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & 0xFFFFFFFFFFFFFFFF
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & 0xFFFFFFFFFFFFFFFF
        z = z ^ (z >> 31)
        return a + (z % (b - a + 1))


def share_image() -> bytes:
    path = os.path.join(CACHE_DIR, "share-1200x630.jpg")
    if os.path.exists(path):
        return open(path, "rb").read()
    _ensure_cache_dir()
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), _hex("#060403"))
    d = ImageDraw.Draw(img)
    # The wordmark, centred and optically raised.
    word = "cirrus"
    size = 140
    # draw with the display face if available, else default serif
    font = _display_font(size)
    bbox = d.textbbox((0, 0), word, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (W - tw) / 2 - bbox[0]
    y = (H - th) / 2 - bbox[1] - (H * 0.03)
    d.text((x, y), word, font=font, fill=_hex("#e9eae4"))
    data = encode_jpeg(img, quality=86)
    with open(path, "wb") as fh:
        fh.write(data)
    return data


_FONT_CACHE = {}


def _display_font(size: int):
    key = ("display", size)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    from PIL import ImageFont

    font = None
    # variable fonts ship with the app; load the display face at weight 300
    base = os.path.dirname(CACHE_DIR)
    for cand in (
        os.path.join(base, "fonts", "CirrusDisplay-VF.woff2"),
        os.path.join(base, "fonts", "CirrusDisplay-VF.ttf"),
    ):
        if os.path.exists(cand):
            try:
                font = ImageFont.truetype(cand, size)
                break
            except Exception:
                pass
    if font is None:
        font = ImageFont.load_default(size)
    _FONT_CACHE[key] = font
    return font


# The still renderer is intentionally pure Python so it runs anywhere without
# native maths libraries; per-pixel work is kept inside a compiled inner loop
# via PIL ops where possible.

"""Procedural media: every pixel the site shows is drawn from a stored seed.

Stills: two seeded linear gradients over one of five allowed colours, plus a
build-time grain tile, composited per media row. Reels: the still's field
displaced along one axis with a slow brightness cycle, drawn per frame on the
client. Nothing is uploaded and nothing is stored but the seed.
"""
import colorsys
import hashlib
import io
import math
import os

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ALLOWED = ["#313236", "#dedede", "#676767", "#333333", "#455e53"]
GRAIN_PATH = os.path.join(os.path.dirname(__file__), "static", "build", "grain.png")
GRAIN_SIZE = 300


def seed_digest(seed: str) -> bytes:
    return hashlib.sha256(("cirrus:" + seed).encode("utf-8")).digest()


def _rgb(hexcolour: str):
    hexcolour = hexcolour.lstrip("#")
    return tuple(int(hexcolour[i : i + 2], 16) for i in (0, 2, 4))


def _saturate(rgb: tuple, factor: float):
    h, l, s = colorsys.rgb_to_hls(*(c / 255.0 for c in rgb))
    r, g, b = colorsys.hls_to_rgb(h, l, max(0.0, min(1.0, s * factor)))
    return (int(r * 255), int(g * 255), int(b * 255))


GREYS = {"#313236", "#dedede", "#676767", "#333333"}
HUE = "#455e53"


def palette_for(seed: str):
    """Seeded gradient plan. The pair always carries either the desaturated
    green or the pale value so the field has range: the work index's colour
    return would be invisible on a pair of greys."""
    d = seed_digest(seed)
    stops = []
    for i in range(3):
        a = ALLOWED[d[i] % len(ALLOWED)]
        b = HUE if d[16 + i] % 3 == 0 else ALLOWED[d[17 + i] % len(ALLOWED)]
        if a in GREYS and b in GREYS and b != "#dedede":
            b = HUE if (d[i] + d[16 + i]) % 2 == 0 else "#dedede"
        stops.append((_rgb(a), _rgb(b)))
    angles = [d[4] * 360 / 255.0, d[9] * 360 / 255.0]
    sat = 1.3 + (d[12] % 90) / 100.0
    return stops, angles, sat


def build_grain_tile(path=GRAIN_PATH):
    """One 300px monochrome fractal-noise tile, generated at build time."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rnd = hashlib.sha256(b"cirrus-grain").digest()
    base = Image.new("L", (GRAIN_SIZE, GRAIN_SIZE), 128)
    for octave, strength in ((1, 60), (2, 30), (4, 16), (8, 8)):
        size = max(4, GRAIN_SIZE // octave)
        layer = Image.effect_noise((size, size), rnd[octave % len(rnd)]).resize(
            (GRAIN_SIZE, GRAIN_SIZE), Image.BILINEAR
        )
        base = Image.blend(base, layer, strength / 120.0)
    base = base.filter(ImageFilter.GaussianBlur(0.4))
    base.save(path, format="PNG", optimize=True)


def _paste_grain(img: Image.Image, strength=0.055):
    tile = Image.open(GRAIN_PATH).convert("L")
    if tile.size != (GRAIN_SIZE, GRAIN_SIZE):
        return img
    w, h = img.size
    cover = Image.new("L", (w, h))
    for y in range(0, h, GRAIN_SIZE):
        for x in range(0, w, GRAIN_SIZE):
            cover.paste(tile, (x, y))
    grain_rgba = cover.convert("RGBA")
    grain_rgba.putalpha(cover.point(lambda p: int(p * strength)))
    img.alpha_composite(grain_rgba)
    return img


def _gradient_layer(size, c0, c1, angle_deg, sat):
    w, h = size
    layer = Image.new("RGBA", (w, h))
    c0, c1 = _saturate(c0, sat), _saturate(c1, sat)
    rad = math.radians(angle_deg)
    dx, dy = math.cos(rad), math.sin(rad)
    px = layer.load()
    for y in range(h):
        for x in range(w):
            t = (x * dx + y * dy) / max(1e-6, (w - 1) * abs(dx) + (h - 1) * abs(dy))
            t = 0.0 if t < 0 else (1.0 if t > 1 else t)
            px[x, y] = (
                int(c0[0] + (c1[0] - c0[0]) * t),
                int(c0[1] + (c1[1] - c0[1]) * t),
                int(c0[2] + (c1[2] - c0[2]) * t),
                255,
            )
    return layer


_render_cache = {}
_RENDER_CACHE_MAX = 192


def render_still(seed: str, width: int, height: int) -> bytes:
    key = (seed, int(width), int(height))
    hit = _render_cache.get(key)
    if hit is not None:
        return hit
    body = _render_still(seed, width, height)
    if len(_render_cache) >= _RENDER_CACHE_MAX:
        _render_cache.clear()
    _render_cache[key] = body
    return body


def _render_still(seed: str, width: int, height: int) -> bytes:
    if width <= 0 or height <= 0:
        width, height = 300, 160
    width, height = int(width), int(height)
    stops, angles, sat = palette_for(seed)
    img = _gradient_layer((width, height), *stops[0], angles[0], sat)
    overlay = _gradient_layer((width, height), *stops[1], angles[1], sat)
    overlay.putalpha(int(255 * 0.22))
    img.alpha_composite(overlay)
    _paste_grain(img)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="WEBP", quality=82, method=4)
    return buf.getvalue()


def reel_params(seed: str) -> dict:
    d = seed_digest(seed)
    direction = -1 if d[20] % 2 else 1
    axis = "x" if d[21] % 2 else "y"
    cycle = 11.0 + (d[22] % 40) / 10.0
    amp = 0.05 + (d[23] % 24) / 240.0
    phase = d[24] / 255.0
    return {"direction": direction, "axis": axis, "cycle": cycle, "amp": amp, "phase": phase}


def render_share_image(path):
    """1200x630, the dark ground with the wordmark centred and optically raised."""
    dark = _rgb("#060403")
    light = _rgb("#e9eae4")
    img = Image.new("RGB", (1200, 630), dark)
    from PIL import ImageFont

    font = None
    for candidate in (
        os.path.join(os.path.dirname(__file__), "static", "fonts", "cirrus-display.woff2"),
    ):
        try:
            font = ImageFont.truetype(candidate, 150)
            break
        except Exception:
            font = None
    draw = ImageDraw.Draw(img)
    if font is None:
        font = ImageFont.load_default()
    text = "cirrus"
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    x = (1200 - w) / 2 - bbox[0]
    y = 630 / 2 - (bbox[3] - bbox[1]) / 2 - bbox[1] - 18
    draw.text((x, y), text, font=font, fill=light)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, format="PNG", optimize=True)

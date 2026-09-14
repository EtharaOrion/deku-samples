"""Deterministic generated pixels.  No binary asset ships with this build.

A still is drawn from its stored seed with Pillow: two gradients between the
five supporting values, at seed-derived angles, plus the one tiling grain tile
the brief pins.  The grain tile and the share card are written once at start-up.
"""
import hashlib
import io
import math
import os
import threading

from PIL import Image, ImageDraw, ImageFont

STOPS = ("#313236", "#dedede", "#676767", "#333333", "#455e53")
GRAIN_PATH = os.path.join(os.path.dirname(__file__), "static", "grain.png")
SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
_lock = threading.Lock()
_cache = {}
_G = None


class Rng:
    def __init__(self, seed):
        self.s = (int(seed) & 0xFFFFFFFF) or 1

    def next(self):
        self.s = (1103515245 * self.s + 12345) & 0x7FFFFFFF
        return self.s

    def pick(self, seq):
        return seq[self.next() % len(seq)]

    def span(self, lo, hi, places=1):
        return round(lo + (hi - lo) * (self.next() % 1000) / 1000.0, places)


def seed_for(text):
    return int(hashlib.sha256(text.encode()).hexdigest()[:8], 16) % 1000000


def intrinsic_height(width, aspect):
    return int(round(width / aspect))


def rgb(hexstr):
    h = hexstr.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def gradient(w, h, c0, c1, angle_deg):
    """A two-stop linear gradient along an arbitrary angle, cheaply."""
    w = max(int(w), 1)
    h = max(int(h), 1)
    ang = math.radians(angle_deg % 360)
    diag = max(int(abs(math.cos(ang)) * w + abs(math.sin(ang)) * h), 2)
    strip = Image.new("RGB", (1, diag))
    sp = strip.load()
    for i in range(diag):
        t = i / (diag - 1)
        sp[0, i] = (int(c0[0] + (c1[0] - c0[0]) * t),
                    int(c0[1] + (c1[1] - c0[1]) * t),
                    int(c0[2] + (c1[2] - c0[2]) * t))
    return strip.resize((w, h)).rotate(-(angle_deg % 360), resample=Image.BILINEAR)


def grain_tile():
    global _G
    if _G is not None:
        return _G
    rng = Rng(424242)
    px = Image.new("L", (300, 300))
    pl = px.load()
    for y in range(300):
        for x in range(300):
            pl[x, y] = rng.next() & 0xFF
    layers = [px]
    for size in (150, 75, 38):
        layers.append(px.resize((size, size)).resize((300, 300), Image.BILINEAR))
    out = Image.new("L", (300, 300), 0)
    po = out.load()
    loads = [l.load() for l in layers]
    for y in range(300):
        for x in range(300):
            v = 0
            for i, l in enumerate(loads):
                v += l[x, y] * (1 << i)
            po[x, y] = min(255, v // 15)
    _G = out
    return out


def overlay_grain(img, alpha=16):
    """One tile, repeated, at very low strength."""
    g = grain_tile().resize(img.size, Image.BILINEAR)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    layer.putalpha(g.point(lambda v: int(v * alpha / 255)))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def render_still(seed, width, height, fmt="PNG"):
    key = (int(seed), int(width), int(height), fmt)
    with _lock:
        if key in _cache:
            return _cache[key]
    rng = Rng(seed)
    a, b = rng.pick(STOPS), rng.pick(STOPS)
    guard = 0
    while b == a and guard < 8:
        b = rng.pick(STOPS)
        guard += 1
    ang = rng.span(0, 360)
    img = gradient(width, height, rgb(a), rgb(b), ang)
    c = rng.pick(STOPS)
    ang2 = rng.span(0, 360)
    second = gradient(width, height, rgb(a), rgb(c), ang2)
    second.putalpha(int(255 * 0.22))
    img = Image.alpha_composite(img.convert("RGBA"), second).convert("RGB")
    img = overlay_grain(img)
    out = img.quantize(colors=64, method=Image.MAXCOVERAGE).convert("P")
    buf = io.BytesIO()
    out.save(buf, fmt, optimize=False)
    data = buf.getvalue()
    with _lock:
        if len(_cache) > 300:
            _cache.clear()
        _cache[key] = data
    return data


def _font(size):
    try:
        return ImageFont.truetype(SERIF, size)
    except Exception:
        return ImageFont.load_default()


def share_card():
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), (6, 4, 3))
    d = ImageDraw.Draw(img)
    f = _font(150)
    tb = d.textbbox((0, 0), "cirrus", font=f)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    d.text(((w - tw) / 2 - tb[0], (h - th) / 2 - tb[1] - 16), "cirrus", font=f,
           fill=(233, 234, 228))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def build_assets():
    os.makedirs(os.path.dirname(GRAIN_PATH), exist_ok=True)
    if not os.path.exists(GRAIN_PATH):
        grain_tile().save(GRAIN_PATH, "PNG")
    return True

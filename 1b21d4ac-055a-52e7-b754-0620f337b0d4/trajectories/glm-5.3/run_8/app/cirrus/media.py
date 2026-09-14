"""Generated pixels.

Every still on the site is drawn from a stored seed, deterministically, on
request: a linear gradient between two of the five supporting values at a
seed-derived angle, a second low-strength overlay at another angle so the
field is not a flat ramp, and one shared 300px monochrome grain tile drawn at
very low strength. The same media id always returns the same image.

Grain: fractal noise, four octaves, base frequency ~0.9, no colour, generated
once at import and cached on the process; one tile, repeated.

Reels: a motion field rather than decoded frames. The still is displaced
slowly along one seed-chosen axis with a 12 second phase cycle and its
brightness breathes on a slower second cycle so the loop point is not visible.
The browser draws the frames; see static/js/media.js.
"""
from __future__ import annotations

import hashlib
import io
import math
import struct

from PIL import Image, ImageDraw

# The five supporting values, and nowhere else.
STOPS = ("#313236", "#dedede", "#676767", "#333333", "#455e53")
GROUND_DARK = "#060403"
GRAIN_SIZE = 300


def _seed_digest(seed: str, salt: str = "") -> int:
    h = hashlib.sha256(f"{salt}:{seed}".encode()).digest()
    return struct.unpack(">Q", h[:8])[0]


def stops_for(seed: str) -> tuple[str, str]:
    """Two of the five values, chosen by the seed. Never identical."""
    d = _seed_digest(seed, "stops")
    a = d % len(STOPS)
    b = (d // len(STOPS)) % (len(STOPS) - 1)
    if b >= a:
        b += 1
    return STOPS[a], STOPS[b]


def angle_for(seed: str, salt: str = "angle") -> float:
    """Angle of the gradient ramp, derived from the seed."""
    return (_seed_digest(seed, salt) % 3600) / 10.0


_GRAIN_CACHE: Image.Image | None = None


def _grain_tile() -> Image.Image:
    """One 300px monochrome fractal-noise tile, reused everywhere.

    The tile is 4 bit-deep: each pixel is the index into a 16x16 tiling of
    four octaves of value noise, which is all the subtlety a 4% overlay can
    carry. All colour is removed (mode L).
    """
    global _GRAIN_CACHE
    if _GRAIN_CACHE is not None:
        return _GRAIN_CACHE
    size = GRAIN_SIZE
    rows: list[list[int]] = []
    rnd = _seed_digest("cirrus-grain", "fixed")
    base = 0.9
    # Precompute the octave lattices at their own resolutions so the whole
    # tile is built from a few hundred noise evaluations rather than 360000.
    lat = []
    for octave in range(4):
        freq = base * (2 ** octave)
        res = max(2, int(round(freq)))
        cell = [[_hash(ix, iy, rnd + octave) for iy in range(res + 1)]
                for ix in range(res + 1)]
        lat.append((freq, res, cell))
    for y in range(size):
        row: list[int] = []
        for x in range(size):
            v = 0.0
            amp = 1.0
            norm = 0.0
            for freq, res, cell in lat:
                fx = x * freq / size
                fy = y * freq / size
                s = _smooth(fx, fy, res, cell)
                v += s * amp
                norm += amp
                amp *= 0.5
            row.append(int(max(0.0, min(1.0, v / norm)) * 255))
        rows.append(row)
    img = Image.new("L", (size, size))
    img.putdata([v for row in rows for v in row])
    _GRAIN_CACHE = img
    return img


def _hash(ix: int, iy: int, seed: int) -> float:
    n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFF) / 255.0


def _smooth(fx: float, fy: float, res: int, cell: list[list[float]]) -> float:
    x0 = int(fx) % res
    y0 = int(fy) % res
    tx = fx - math.floor(fx)
    ty = fy - math.floor(fy)
    sx = tx * tx * (3 - 2 * tx)
    sy = ty * ty * (3 - 2 * ty)
    n00 = cell[x0][y0]
    n10 = cell[(x0 + 1) % res][y0]
    n01 = cell[x0][(y0 + 1) % res]
    n11 = cell[(x0 + 1) % res][(y0 + 1) % res]
    top = n00 + (n10 - n00) * sx
    bot = n01 + (n11 - n01) * sx
    return top + (bot - top) * sy




def still(seed: str, width: int, height: int) -> bytes:
    """The generated still for one media row: PNG bytes.

    Two linear gradients between seed-chosen stops of the five supporting
    values, the second at low strength so the field is not a flat ramp, then
    the shared grain tile at very low strength. Nothing else is drawn.
    """
    c1, c2 = stops_for(seed)
    a1 = math.radians(angle_for(seed, "a1"))
    a2 = math.radians(angle_for(seed, "a2"))
    r1, g1, b1 = _rgb(c1)
    r2, g2, b2 = _rgb(c2)
    cos1, sin1 = math.cos(a1), math.sin(a1)
    cos2, sin2 = math.cos(a2), math.sin(a2)
    span = float(width + height)

    img = Image.new("RGB", (width, height))
    px = img.load()
    for y in range(height):
        d1y = (sin1 * y) / span + 0.5
        d2y = (sin2 * y) / span + 0.5
        for x in range(width):
            u1 = d1y + (cos1 * x) / span
            u1 = 0.0 if u1 < 0.0 else (1.0 if u1 > 1.0 else u1)
            u2 = d2y + (cos2 * x) / span
            u2 = 0.0 if u2 < 0.0 else (1.0 if u2 > 1.0 else u2)
            r = r1 + (r2 - r1) * u1
            g = g1 + (g2 - g1) * u1
            b = b1 + (b2 - b1) * u1
            # second overlay at low strength so the field is not a flat ramp
            k = 0.22
            r = r + ((r1 + (r2 - r1) * u2) - r) * k
            g = g + ((g1 + (g2 - g1) * u2) - g) * k
            b = b + ((b1 + (b2 - b1) * u2) - b) * k
            px[x, y] = (int(r), int(g), int(b))

    grain = _grain_tile().resize((width, height), Image.BILINEAR)
    img = _composite_grain(img, grain)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()



def _composite_grain(img: Image.Image, grain: Image.Image) -> Image.Image:
    """Grain at very low strength: enough to break gradient banding, no more."""
    from PIL import ImageChops

    strength = 0.05
    grey = grain.convert("L")
    base = img.convert("L")
    diff = ImageChops.difference(grey, base)
    diff = diff.point(lambda v: int((v - 128) * strength + 128))
    return ImageChops.overlay(img, diff.convert("RGB"))


def _mix(c1: str, c2: str, t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    a = _rgb(c1)
    b = _rgb(c2)
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def _rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

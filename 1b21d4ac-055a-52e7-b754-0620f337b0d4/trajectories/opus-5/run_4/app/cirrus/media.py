"""Procedural stills and the grain tile. No binary asset ships with this build.

A still is drawn from its media row's stored seed, so the same record always
produces the same pixels and two requests for one media id agree.
"""
import io
import os
import math
import threading

import numpy as np
from PIL import Image

# The five supporting values. None of them ever carries text.
PALETTE = ["#313236", "#dedede", "#676767", "#333333", "#455e53"]

GRAIN_TILE = 300
_grain_cache = None
_grain_png = None
_lock = threading.Lock()
_still_cache = {}
_still_order = []
STILL_CACHE_MAX = 96


def _hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _rng(seed):
    return np.random.default_rng(int(seed) & 0xFFFFFFFF)


def _fractal_noise(size, seed=97, octaves=4, base_freq=0.9):
    """Monochrome fractal noise, four octaves, tiling at `size`."""
    rng = _rng(seed)
    field = np.zeros((size, size), dtype=np.float64)
    amp_total = 0.0
    for o in range(octaves):
        cells = max(2, int(round(base_freq * size / (2 ** (octaves - 1 - o)) / 40)))
        cells = min(cells, size)
        grid = rng.random((cells, cells))
        # tile by wrapping the grid, then bilinear-resample to full size
        grid = np.vstack([grid, grid[:1]])
        grid = np.hstack([grid, grid[:, :1]])
        ys = np.linspace(0, cells, size, endpoint=False)
        xs = np.linspace(0, cells, size, endpoint=False)
        y0 = np.floor(ys).astype(int)
        x0 = np.floor(xs).astype(int)
        fy = (ys - y0)[:, None]
        fx = (xs - x0)[None, :]
        fy = fy * fy * (3 - 2 * fy)
        fx = fx * fx * (3 - 2 * fx)
        g00 = grid[np.ix_(y0, x0)]
        g01 = grid[np.ix_(y0, x0 + 1)]
        g10 = grid[np.ix_(y0 + 1, x0)]
        g11 = grid[np.ix_(y0 + 1, x0 + 1)]
        layer = (g00 * (1 - fx) * (1 - fy) + g01 * fx * (1 - fy)
                 + g10 * (1 - fx) * fy + g11 * fx * fy)
        amp = 0.5 ** (octaves - 1 - o)
        field += layer * amp
        amp_total += amp
    field /= amp_total
    return field


def grain_field():
    global _grain_cache
    if _grain_cache is None:
        with _lock:
            if _grain_cache is None:
                f = _fractal_noise(GRAIN_TILE)
                f = (f - f.mean()) / (f.std() or 1.0)
                _grain_cache = np.clip(f, -3, 3)
    return _grain_cache


def grain_png():
    """The one tile, repeated; served once and reused everywhere."""
    global _grain_png
    if _grain_png is None:
        f = grain_field()
        arr = np.clip(128 + f * 26, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr, mode="L").convert("RGBA")
        alpha = Image.new("L", img.size, 46)
        img.putalpha(alpha)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        _grain_png = buf.getvalue()
    return _grain_png


def _linear_gradient(w, h, angle_deg, c0, c1):
    ang = math.radians(angle_deg)
    yy, xx = np.mgrid[0:h, 0:w]
    xn = xx / max(w - 1, 1) - 0.5
    yn = yy / max(h - 1, 1) - 0.5
    t = xn * math.cos(ang) + yn * math.sin(ang)
    t = (t - t.min()) / ((t.max() - t.min()) or 1.0)
    t = t[..., None]
    a = np.array(c0, dtype=np.float64)
    b = np.array(c1, dtype=np.float64)
    return a * (1 - t) + b * t


def render_still(seed, width, height, max_dim=1280):
    """Two gradients between two of the five values, plus the grain, and nothing else."""
    seed = int(seed)
    width = max(1, min(int(width), 4000))
    height = max(1, min(int(height), 4000))
    scale = min(1.0, max_dim / max(width, height))
    w = max(1, int(round(width * scale)))
    h = max(1, int(round(height * scale)))

    key = (seed, w, h)
    cached = _still_cache.get(key)
    if cached:
        return cached

    rng = _rng(seed * 2654435761 % (2 ** 32))
    idx = list(range(len(PALETTE)))
    rng.shuffle(idx)
    c0 = _hex_to_rgb(PALETTE[idx[0]])
    c1 = _hex_to_rgb(PALETTE[idx[1]])
    c2 = _hex_to_rgb(PALETTE[idx[2]])
    c3 = _hex_to_rgb(PALETTE[idx[3]])

    angle_a = (seed % 360)
    angle_b = (seed * 7 % 360)

    base = _linear_gradient(w, h, angle_a, c0, c1)
    over = _linear_gradient(w, h, angle_b, c2, c3)
    strength = 0.22 + (seed % 13) / 100.0
    field = base * (1 - strength) + over * strength

    g = grain_field()
    ty = (np.arange(h) % GRAIN_TILE)
    tx = (np.arange(w) % GRAIN_TILE)
    grain = g[np.ix_(ty, tx)][..., None]
    field = field + grain * 4.5

    arr = np.clip(field, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82, optimize=True, progressive=True)
    data = buf.getvalue()

    with _lock:
        _still_cache[key] = data
        _still_order.append(key)
        while len(_still_order) > STILL_CACHE_MAX:
            _still_cache.pop(_still_order.pop(0), None)
    return data


def share_image(wordmark_text="cirrus"):
    """1200 x 630, the dark ground, the wordmark centred and optically raised."""
    from PIL import ImageDraw, ImageFont
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), _hex_to_rgb("#060403"))
    draw = ImageDraw.Draw(img)
    # The display face is a WOFF2, which a FreeType built without brotli cannot
    # open. The share card must still render, so fall back to the default face
    # rather than letting the route raise.
    font = None
    for loader in (
        lambda: ImageFont.truetype(
            os.path.join(os.path.dirname(__file__), "static", "fonts",
                         "cirrus-display.woff2"), 150),
        lambda: ImageFont.load_default(150),
        lambda: ImageFont.load_default(),
    ):
        try:
            font = loader()
            break
        except Exception:
            continue
    try:
        box = draw.textbbox((0, 0), wordmark_text, font=font)
        tw, th = box[2] - box[0], box[3] - box[1]
        # Optically raised by the same correction the marks use.
        draw.text(((w - tw) / 2 - box[0], (h - th) / 2 - box[1] - 14.5078),
                  wordmark_text, font=font, fill=_hex_to_rgb("#e9eae4"))
    except Exception:
        # The card is the dark ground with the wordmark and no photograph. If no
        # face can be measured at all, ship the ground rather than a 500.
        pass
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()

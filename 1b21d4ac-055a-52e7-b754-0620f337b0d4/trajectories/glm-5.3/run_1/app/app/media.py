"""Generated pixels. A media row carries a seed; the app draws from it.

Stills are two flat gradient fields at angles derived from the seed, drawn from
the five permitted generator stops, with one grain tile composited at very low
strength. Nothing is uploaded and nothing is stored: two requests for the same
media id return the same pixels.
"""
import colorsys
import hashlib
import io
import math
import random
import threading

PALETTE = ("#313236", "#676767", "#333333", "#455e53", "#dedede")
DARK = "#060403"
GRAIN_BASE_FREQUENCY = 0.9
GRAIN_STRENGTH = 0.055


def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def desaturate(rgb, amount):
    """amount 1 is untouched, 0 is fully grey."""
    h, l, s = colorsys.rgb_to_hls(*(c / 255.0 for c in rgb))
    r, g, b = colorsys.hls_to_rgb(h, l, s * amount)
    return (r * 255, g * 255, b * 255)


def field_for(seed: str):
    """Deterministic field geometry. The same record always produces the same still."""
    h = hashlib.sha256(("cirrus:" + seed).encode()).digest()
    i1 = h[0] % 5
    i2 = h[1] % 4
    if i2 >= i1:
        i2 += 1
    i3 = (h[2] % 3) + 1
    if i3 == i1 or i3 == i2:
        i3 = (i3 % 5) + 1
    return {
        "c1": PALETTE[i1],
        "c2": PALETTE[i2],
        "c3": PALETTE[i3],
        "angle": (h[3] / 255.0) * math.pi,
        "angle2": (h[4] / 255.0) * math.pi * 0.8 + 0.5,
        "grain_shift": (h[5] % 300, h[6] % 300),
        "bright": 0.97 + (h[7] / 255.0) * 0.06,
        "drift": 1 if (h[8] & 1) else -1,
    }


def _ramp(angle, w, h):
    import numpy as np

    x = np.linspace(0.0, 1.0, w, dtype=np.float32)
    y = np.linspace(0.0, 1.0, h, dtype=np.float32)
    X, Y = np.meshgrid(x, y)
    t = X * math.cos(angle) + Y * math.sin(angle)
    return np.clip((t + 1.0) / 2.0, 0.0, 1.0)


def grain_tile(size=300):
    """One fractal-noise monochrome tile, generated once and reused everywhere."""
    import numpy as np

    freqs = [GRAIN_BASE_FREQUENCY * (0.5 ** o) for o in range(4)]
    rng = random.Random(7021)
    phases = [(rng.uniform(0, 6.283), rng.uniform(0, 6.283)) for _ in freqs]
    x = np.arange(size, dtype=np.float32)
    y = np.arange(size, dtype=np.float32)
    X, Y = np.meshgrid(x, y)
    acc = np.zeros((size, size), dtype=np.float32)
    amp = 1.0
    for f, (px, py) in zip(freqs, phases):
        acc += amp * np.sin(X * f * 0.35 + px) * np.cos(Y * f * 0.35 + py)
        acc += amp * 0.5 * np.sin((X + Y) * f * 0.21 + px + py)
        amp *= 0.55
    acc = (acc - acc.min()) / (acc.max() - acc.min() + 1e-6)
    return (acc * 255).astype(np.uint8)


class MediaRenderer:
    def __init__(self, cache_size=256):
        self._cache = {}
        self._cache_size = cache_size
        self._lock = threading.Lock()
        self._tile = None

    def _get(self, key):
        with self._lock:
            return self._cache.get(key)

    def _put(self, key, value):
        with self._lock:
            if len(self._cache) >= self._cache_size:
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = value

    def tile(self):
        with self._lock:
            if self._tile is None:
                self._tile = grain_tile()
            return self._tile

    def field_image(self, seed, width, height, brightness=1.0, desaturation=None, phase=0.0):
        """The still as an RGB PIL image. phase shifts the ramp for reel frames."""
        import numpy as np
        from PIL import Image

        w, h = max(1, int(width)), max(1, int(height))
        f = field_for(seed)
        c1 = np.array(hex_to_rgb(f["c1"]), dtype=np.float32)
        c2 = np.array(hex_to_rgb(f["c2"]), dtype=np.float32)
        c3 = np.array(hex_to_rgb(f["c3"]), dtype=np.float32)
        dark = np.array(hex_to_rgb(DARK), dtype=np.float32)
        if desaturation is not None:
            c1 = np.array(desaturate(tuple(c1), desaturation), dtype=np.float32)
            c2 = np.array(desaturate(tuple(c2), desaturation), dtype=np.float32)
            c3 = np.array(desaturate(tuple(c3), desaturation), dtype=np.float32)
            dark = np.array(desaturate(tuple(dark), desaturation), dtype=np.float32)
        t1 = _ramp(f["angle"] + phase * 0.12 * f["drift"], w, h)[..., None]
        base = c1 + (c2 - c1) * t1
        t2 = _ramp(f["angle2"] - phase * 0.18 * f["drift"], w, h)[..., None]
        overlay = dark + (c3 - dark) * t2
        img = base * 0.78 + overlay * 0.22
        # reel brightness cycle, a few percent, so the loop point is not visible
        if brightness != 1.0:
            img = img * brightness
        # the one grain tile, shifted per seed, composited at very low strength
        tile = self.tile()
        sh_y, sh_x = f["grain_shift"]
        th, tw = tile.shape
        reps_y = h // th + 2
        reps_x = w // tw + 2
        big = np.tile(tile, (reps_y, reps_x))
        big = np.roll(big, shift=(sh_y, sh_x), axis=(0, 1))[:h, :w].astype(np.float32)[..., None]
        img = img + (big - 128.0) * GRAIN_STRENGTH
        return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")

    def still_png(self, seed, width, height):
        key = ("png", seed, width, height)
        cached = self._get(key)
        if cached is not None:
            return cached
        img = self.field_image(seed, width, height)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        self._put(key, data)
        return data

    def still_webp(self, seed, width, height, quality=70):
        key = ("webp", seed, width, height, quality)
        cached = self._get(key)
        if cached is not None:
            return cached
        img = self.field_image(seed, width, height)
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=quality, method=4)
        data = buf.getvalue()
        self._put(key, data)
        return data

    def share_image(self, wordmark="cirrus", font_path=None):
        from PIL import Image, ImageDraw, ImageFont

        img = Image.new("RGB", (1200, 630), hex_to_rgb(DARK))
        d = ImageDraw.Draw(img)
        font = None
        if font_path:
            for size in (150, 120, 96):
                try:
                    font = ImageFont.truetype(font_path, size)
                    break
                except Exception:
                    font = None
        if font is None:
            font = ImageFont.load_default(96)
        text = wordmark.lower()
        left, top, right, bottom = d.textbbox((0, 0), text, font=font)
        w = right - left
        x = (1200 - w) / 2 - left
        y = 630 / 2 - (bottom - top) / 2 - top - 18  # optically raised, as the marks are
        d.text((x, y), text, fill=hex_to_rgb("#e9eae4"), font=font)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()

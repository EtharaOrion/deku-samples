#!/usr/local/bin/python3
"""Build-time generated assets: the 300px grain tile and the 1200x630 share image.

Nothing here is fetched at runtime. The grain is one monochrome tile reused
everywhere; the share image is the dark ground with the wordmark on it.
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import pixels  # noqa: E402

GRAIN_SIZE = 300


def _hash_noise(a: int, b: int) -> float:
    v = ((a * 73856093) ^ (b * 19349663)) % 1000003
    return v / 1000003.0


def _value_noise(x: float, y: float) -> float:
    xi, yi = int(x), int(y)
    xf, yf = x - xi, y - yi
    a = _hash_noise(xi, yi)
    b = _hash_noise(xi + 1, yi)
    c = _hash_noise(xi, yi + 1)
    d = _hash_noise(xi + 1, yi + 1)
    u = xf * xf * (3 - 2 * xf)
    v = yf * yf * (3 - 2 * yf)
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v


def _fbm(x: float, y: float, octaves=(0.9, 1.8, 3.6, 7.2)) -> float:
    total, amp, norm = 0.0, 1.0, 0.0
    for f in octaves:
        total += amp * _value_noise(x * f, y * f)
        norm += amp
        amp *= 0.5
    return total / norm


def grain_tile() -> Image.Image:
    img = Image.new("L", (GRAIN_SIZE, GRAIN_SIZE))
    px = img.load()
    for y in range(GRAIN_SIZE):
        for x in range(GRAIN_SIZE):
            px[x, y] = int(255 * min(1.0, max(0.0, _fbm(x / 24.0, y / 24.0))))
    return img


def build(static_dir: str) -> None:
    os.makedirs(os.path.join(static_dir, "media"), exist_ok=True)
    grain_tile().save(os.path.join(static_dir, "media", "grain.png"), "PNG", optimize=True)
    with open(os.path.join(static_dir, "media", "share.png"), "wb") as fh:
        fh.write(pixels.share_image())


if __name__ == "__main__":
    build(os.environ.get("STATIC_DIR", "/app/static"))

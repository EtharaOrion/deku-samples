"""Zero-asset pixels: every still, the grain tile and the share card are drawn from a seed."""
from __future__ import annotations

import hashlib
import math
import os
import struct
import zlib

# the five supporting values, generator inputs only, never text
GENERATOR_COLOURS = ["#313236", "#676767", "#333333", "#455e53", "#dedede"]

DARK = "#060403"
LIGHT = "#e9eae4"


def _digest(seed: str) -> bytes:
    return hashlib.sha256(("cirrus/" + (seed or "")).encode("utf-8")).digest()


def still_recipe(seed: str) -> dict:
    d = _digest(seed)
    a = d[0] % len(GENERATOR_COLOURS)
    b = (a + 1 + d[1] % (len(GENERATOR_COLOURS) - 1)) % len(GENERATOR_COLOURS)
    c = (b + 1 + d[2] % (len(GENERATOR_COLOURS) - 1)) % len(GENERATOR_COLOURS)
    angle = (d[3] / 255.0) * 360.0
    angle2 = (angle + 55.0 + (d[4] / 255.0) * 110.0) % 360.0
    return {
        "from": GENERATOR_COLOURS[a],
        "to": GENERATOR_COLOURS[b],
        "overlay": GENERATOR_COLOURS[c],
        "angle": angle,
        "angle2": angle2,
        "strength": 0.22 + (d[5] / 255.0) * 0.2,
        "stop": 0.35 + (d[6] / 255.0) * 0.3,
    }


def _vector(angle_deg: float) -> tuple[float, float, float, float]:
    rad = math.radians(angle_deg)
    dx, dy = math.cos(rad), math.sin(rad)
    x1 = 0.5 - dx / 2
    y1 = 0.5 - dy / 2
    x2 = 0.5 + dx / 2
    y2 = 0.5 + dy / 2
    return x1, y1, x2, y2


def still_svg(seed: str, width: int, height: int) -> str:
    """A gradient field: two ramps at different angles and nothing drawn on top."""
    r = still_recipe(seed)
    x1, y1, x2, y2 = _vector(r["angle"])
    x3, y3, x4, y4 = _vector(r["angle2"])
    uid = hashlib.md5((seed or "").encode()).hexdigest()[:8]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" preserveAspectRatio="xMidYMid slice" role="presentation">'
        f'<defs>'
        f'<linearGradient id="a{uid}" x1="{x1:.4f}" y1="{y1:.4f}" x2="{x2:.4f}" y2="{y2:.4f}">'
        f'<stop offset="0" stop-color="{r["from"]}"/>'
        f'<stop offset="{r["stop"]:.3f}" stop-color="{r["from"]}" stop-opacity="0.72"/>'
        f'<stop offset="1" stop-color="{r["to"]}"/>'
        f'</linearGradient>'
        f'<linearGradient id="b{uid}" x1="{x3:.4f}" y1="{y3:.4f}" x2="{x4:.4f}" y2="{y4:.4f}">'
        f'<stop offset="0" stop-color="{r["overlay"]}" stop-opacity="{r["strength"]:.3f}"/>'
        f'<stop offset="0.62" stop-color="{r["overlay"]}" stop-opacity="0.04"/>'
        f'<stop offset="1" stop-color="{r["from"]}" stop-opacity="{r["strength"] * 0.8:.3f}"/>'
        f'</linearGradient>'
        f'</defs>'
        f'<rect width="{width}" height="{height}" fill="url(#a{uid})"/>'
        f'<rect width="{width}" height="{height}" fill="url(#b{uid})"/>'
        f'</svg>'
    )


# ---------------------------------------------------------------- the grain tile

def _png(width: int, height: int, rows: list[bytes]) -> bytes:
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def _value_noise(size: int, freq: int, seed: int) -> list[list[float]]:
    import random

    rnd = random.Random(seed)
    grid = [[rnd.random() for _ in range(freq)] for _ in range(freq)]

    def smooth(t: float) -> float:
        return t * t * (3 - 2 * t)

    out = []
    for y in range(size):
        row = []
        gy = y * freq / size
        y0 = int(gy) % freq
        y1 = (y0 + 1) % freq
        fy = smooth(gy - int(gy))
        for x in range(size):
            gx = x * freq / size
            x0 = int(gx) % freq
            x1 = (x0 + 1) % freq
            fx = smooth(gx - int(gx))
            top = grid[y0][x0] * (1 - fx) + grid[y0][x1] * fx
            bot = grid[y1][x0] * (1 - fx) + grid[y1][x1] * fx
            row.append(top * (1 - fy) + bot * fy)
        out.append(row)
    return out


_GRAIN_CACHE: bytes | None = None
_GRAIN_PATH = os.path.join(os.path.dirname(__file__), "static", "grain-tile.png")


def grain_tile_png(size: int = 300) -> bytes:
    """Fractal value noise over four octaves, monochrome. One tile, generated once at
    build time and written beside the static files, then reused for every request."""
    global _GRAIN_CACHE
    if _GRAIN_CACHE is not None:
        return _GRAIN_CACHE
    if os.path.exists(_GRAIN_PATH):
        with open(_GRAIN_PATH, "rb") as fh:
            _GRAIN_CACHE = fh.read()
        return _GRAIN_CACHE
    octaves = [
        (_value_noise(size, 12, 11), 0.5),
        (_value_noise(size, 24, 23), 0.25),
        (_value_noise(size, 48, 37), 0.15),
        (_value_noise(size, 96, 53), 0.10),
    ]
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            v = sum(field[y][x] * weight for field, weight in octaves)
            level = int(max(0.0, min(1.0, v)) * 255)
            alpha = 46  # composited at very low strength
            row += bytes((level, level, level, alpha))
        rows.append(bytes(row))
    _GRAIN_CACHE = _png(size, size, rows)
    try:
        with open(_GRAIN_PATH, "wb") as fh:
            fh.write(_GRAIN_CACHE)
    except OSError:
        pass  # a read-only filesystem just means it stays in memory
    return _GRAIN_CACHE


# ---------------------------------------------------------------- the share card

def share_svg(house_name: str) -> str:
    """1200 x 630, the dark ground, the wordmark centred and optically raised."""
    name = (house_name or "cirrus").lower()
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" '
        'viewBox="0 0 1200 630">'
        f'<rect width="1200" height="630" fill="{DARK}"/>'
        f'<text x="585.49" y="330" text-anchor="middle" fill="{LIGHT}" '
        'font-family="Cirrus Display, Times New Roman, Times, serif" font-size="120" '
        f'font-weight="300" letter-spacing="-2">{name}</text>'
        '</svg>'
    )

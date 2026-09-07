"""Every pixel on this site is drawn by the app from a stored seed.

Stills are SVG fields built from a media row's seed; the grain is one 300px
monochrome tile encoded once at start-up with a hand-rolled PNG writer, so no
binary and no extra dependency ships with the build.
"""
from __future__ import annotations

import base64
import hashlib
import random
import struct
import zlib

# The five supporting values. None of them ever carries text.
GENERATOR_STOPS = ["#dedede", "#676767", "#333333", "#455e53", "#313236"]

GRAIN_TILE_PX = 300


def seed_ints(seed: str, count: int = 8) -> list[int]:
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return [digest[i % len(digest)] for i in range(count)]


def still_svg(seed: str, width: int, height: int) -> str:
    a, b, c, d, e, f, *_ = seed_ints(seed)
    first = GENERATOR_STOPS[a % len(GENERATOR_STOPS)]
    second_pool = [s for s in GENERATOR_STOPS if s != first]
    second = second_pool[b % len(second_pool)]
    third = second_pool[(b + 1 + (c % 2)) % len(second_pool)]
    angle = (c / 255.0) * 360.0
    angle2 = (angle + 55.0 + (d / 255.0) * 110.0) % 360.0
    overlay_strength = 0.22 + (e / 255.0) * 0.2
    mid = 0.35 + (f / 255.0) * 0.3
    gid = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:10]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" preserveAspectRatio="xMidYMid slice" role="img">'
        f'<defs>'
        f'<linearGradient id="g{gid}a" gradientUnits="userSpaceOnUse" '
        f'gradientTransform="rotate({angle:.2f} {width / 2:.1f} {height / 2:.1f})" '
        f'x1="0" y1="0" x2="{width}" y2="{height}">'
        f'<stop offset="0" stop-color="{first}"/>'
        f'<stop offset="1" stop-color="{second}"/>'
        f'</linearGradient>'
        f'<linearGradient id="g{gid}b" gradientUnits="userSpaceOnUse" '
        f'gradientTransform="rotate({angle2:.2f} {width / 2:.1f} {height / 2:.1f})" '
        f'x1="0" y1="0" x2="{width}" y2="{height}">'
        f'<stop offset="0" stop-color="{third}" stop-opacity="0"/>'
        f'<stop offset="{mid:.3f}" stop-color="{third}" stop-opacity="{overlay_strength:.3f}"/>'
        f'<stop offset="1" stop-color="{first}" stop-opacity="0"/>'
        f'</linearGradient>'
        f'</defs>'
        f'<rect width="{width}" height="{height}" fill="url(#g{gid}a)"/>'
        f'<rect width="{width}" height="{height}" fill="url(#g{gid}b)"/>'
        f'</svg>'
    )


def still_stops(seed: str) -> dict:
    """The same choice the SVG makes, handed to the canvas renderer."""
    a, b, c, d, e, f, *_ = seed_ints(seed)
    first = GENERATOR_STOPS[a % len(GENERATOR_STOPS)]
    pool = [s for s in GENERATOR_STOPS if s != first]
    second = pool[b % len(pool)]
    third = pool[(b + 1 + (c % 2)) % len(pool)]
    return {
        "first": first,
        "second": second,
        "third": third,
        "angle": (c / 255.0) * 360.0,
        "angle2": ((c / 255.0) * 360.0 + 55.0 + (d / 255.0) * 110.0) % 360.0,
        "strength": 0.22 + (e / 255.0) * 0.2,
        "mid": 0.35 + (f / 255.0) * 0.3,
        "drift": 1 if (f % 2) else -1,
    }


def _png(width: int, height: int, rows: list[bytes], colour_type: int, bit_depth: int = 8) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    raw = b"".join(b"\x00" + row for row in rows)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, bit_depth,
                                         colour_type, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def grain_tile_png(size: int = GRAIN_TILE_PX) -> bytes:
    """One tiling monochrome noise field: fractal value noise, four octaves."""
    rng = random.Random(0x5EED)
    field = [[0.0] * size for _ in range(size)]
    total_amp = 0.0
    for octave in range(4):
        cells = max(2, int(round(size * 0.9 / (2 ** (3 - octave)) / 8)))
        amp = 1.0 / (2 ** octave)
        total_amp += amp
        grid = [[rng.random() for _ in range(cells)] for _ in range(cells)]
        step = size / cells
        for y in range(size):
            gy = y / step
            y0 = int(gy) % cells
            y1 = (y0 + 1) % cells
            ty = gy - int(gy)
            ty = ty * ty * (3 - 2 * ty)
            for x in range(size):
                gx = x / step
                x0 = int(gx) % cells
                x1 = (x0 + 1) % cells
                tx = gx - int(gx)
                tx = tx * tx * (3 - 2 * tx)
                top = grid[y0][x0] * (1 - tx) + grid[y0][x1] * tx
                bot = grid[y1][x0] * (1 - tx) + grid[y1][x1] * tx
                field[y][x] += (top * (1 - ty) + bot * ty) * amp
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            v = field[y][x] / total_amp
            # a hard per-pixel jitter is what reads as film rather than cloud
            v = 0.5 * v + 0.5 * rng.random()
            row.append(max(0, min(255, int(v * 255))))
        rows.append(bytes(row))
    return _png(size, size, rows, colour_type=0)


def grain_data_uri() -> str:
    return "data:image/png;base64," + base64.b64encode(grain_tile_png()).decode()


def share_image_svg(house_name: str, dark: str = "#060403", light: str = "#e9eae4") -> str:
    """1200x630: the dark ground, the wordmark centred and optically raised."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" '
        'viewBox="0 0 1200 630">'
        f'<rect width="1200" height="630" fill="{dark}"/>'
        f'<text x="600" y="315" text-anchor="middle" '
        f'font-family="Times New Roman, Times, serif" font-size="150" font-weight="300" '
        f'fill="{light}" transform="translate(-14.5078 0)" dominant-baseline="middle">'
        f'{house_name.lower()}</text>'
        '</svg>'
    )

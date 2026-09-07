"""Zero-asset procedural pixels. Every still is drawn from its row's stored seed.

A still is a linear gradient between two of the five supporting values at an angle taken
from the seed, a second gradient at a different angle at low strength, and one repeated
grain tile. Nothing else is drawn: no text, no dimensions, no diagonal cross.
"""
from __future__ import annotations

import hashlib
import math
import struct
import zlib

# The five supporting values the generator draws from. None of these ever carries text.
PALETTE = ["#313236", "#dedede", "#676767", "#333333", "#455e53"]

DARK = "#060403"
LIGHT = "#e9eae4"


def _digest(seed: str) -> bytes:
    return hashlib.sha256(("cirrus:" + seed).encode()).digest()


def seed_numbers(seed: str) -> dict:
    d = _digest(seed)
    a = d[0] % len(PALETTE)
    b = d[1] % (len(PALETTE) - 1)
    if b >= a:
        b += 1
    return {
        "colour_a": PALETTE[a],
        "colour_b": PALETTE[b],
        "colour_c": PALETTE[d[2] % len(PALETTE)],
        "angle": (d[3] / 255.0) * 360.0,
        "angle2": (d[4] / 255.0) * 360.0,
        "strength": 0.18 + (d[5] / 255.0) * 0.22,
        "drift": 1 if d[6] % 2 else -1,
        "vertical": bool(d[7] % 2),
        "offset": d[8] / 255.0,
    }


def _gradient_vector(angle_deg: float) -> tuple[float, float, float, float]:
    rad = math.radians(angle_deg)
    dx, dy = math.cos(rad), math.sin(rad)
    x1 = 0.5 - dx / 2
    y1 = 0.5 - dy / 2
    x2 = 0.5 + dx / 2
    y2 = 0.5 + dy / 2
    return x1, y1, x2, y2


def still_svg(seed: str, width: int, height: int) -> str:
    n = seed_numbers(seed)
    uid = hashlib.md5(seed.encode()).hexdigest()[:8]
    x1, y1, x2, y2 = _gradient_vector(n["angle"])
    p1, q1, p2, q2 = _gradient_vector(n["angle2"])
    mid = 0.35 + n["offset"] * 0.3
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" \
viewBox="0 0 {width} {height}" preserveAspectRatio="xMidYMid slice" role="presentation">
  <defs>
    <linearGradient id="g1-{uid}" x1="{x1:.4f}" y1="{y1:.4f}" x2="{x2:.4f}" y2="{y2:.4f}">
      <stop offset="0" stop-color="{n['colour_a']}"/>
      <stop offset="{mid:.3f}" stop-color="{n['colour_b']}"/>
      <stop offset="1" stop-color="{n['colour_a']}"/>
    </linearGradient>
    <linearGradient id="g2-{uid}" x1="{p1:.4f}" y1="{q1:.4f}" x2="{p2:.4f}" y2="{q2:.4f}">
      <stop offset="0" stop-color="{n['colour_c']}" stop-opacity="{n['strength']:.3f}"/>
      <stop offset="1" stop-color="{n['colour_b']}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#g1-{uid})"/>
  <rect width="{width}" height="{height}" fill="url(#g2-{uid})"/>
</svg>
"""


def grain_tile_svg() -> str:
    """One 300px monochrome grain tile, generated once and reused everywhere."""
    return """<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" \
viewBox="0 0 300 300">
  <filter id="g" x="0" y="0" width="300" height="300">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="7"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <rect width="300" height="300" filter="url(#g)" opacity="0.5"/>
</svg>
"""


# --------------------------------------------------------------------------- share image


def _png(width: int, height: int, pixels: bytearray) -> bytes:
    """Minimal RGB PNG writer, so the build ships no binary and needs no imaging library."""
    raw = bytearray()
    stride = width * 3
    for y in range(height):
        raw.append(0)
        raw += pixels[y * stride : (y + 1) * stride]

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def _hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def share_png(width: int = 1200, height: int = 630) -> bytes:
    """The dark ground with the house mark centred and optically raised. No photograph."""
    ground = _hex_rgb(DARK)
    ink = _hex_rgb(LIGHT)
    px = bytearray(bytes(ground) * (width * height))
    cx, cy = width / 2.0, height / 2.0 - 14.5078
    rx, ry = 205.0, 90.0
    stroke = 7.5
    for y in range(int(cy - ry - stroke - 2), int(cy + ry + stroke + 3)):
        if y < 0 or y >= height:
            continue
        for x in range(int(cx - rx - stroke - 2), int(cx + rx + stroke + 3)):
            if x < 0 or x >= width:
                continue
            dx = (x - cx) / rx
            dy = (y - cy) / ry
            d = math.hypot(dx, dy)
            edge = abs(d - 1.0) * min(rx, ry)
            if edge <= stroke:
                a = 1.0 if edge <= stroke - 1 else (stroke - edge)
                i = (y * width + x) * 3
                for k in range(3):
                    px[i + k] = int(ground[k] + (ink[k] - ground[k]) * a)
    return _png(width, height, px)

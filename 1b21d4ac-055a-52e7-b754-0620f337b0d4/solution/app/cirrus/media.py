"""Deterministic pixel generation.

No binary asset ships with this build.  Every still, every reel base field and
the share image are drawn by the app from a stored seed, so two requests for the
same media id return byte-identical content.

The five supporting values below are gradient stops only.  None of them is ever
set on text; a visitor only ever meets them inside a generated still.
"""

from __future__ import annotations

import hashlib

# Gradient stops the still generator draws from.  `#455e53` carries the most
# saturation and is what makes the work index colour return legible.
STOPS = ("#dedede", "#676767", "#333333", "#455e53", "#313236")

DARK = "#060403"
LIGHT = "#e9eae4"

SVG_MIME = "image/svg+xml; charset=utf-8"

# One grain tile, generated once and repeated.  Fractal noise at base frequency
# 0.9 over four octaves, all colour removed, composited at very low strength.
GRAIN_TILE = 300
GRAIN_BASE_FREQUENCY = "0.9"
GRAIN_OCTAVES = "4"


def _bytes_for(seed: str) -> bytes:
    return hashlib.sha256(str(seed).encode("utf-8")).digest()


def _pick(digest: bytes, index: int, modulo: int) -> int:
    return digest[index % len(digest)] % modulo


def palette(seed: str) -> tuple[str, str, str]:
    """Two gradient stops for the base fill plus one stop for the overlay."""
    digest = _bytes_for(seed)
    first = _pick(digest, 0, len(STOPS))
    second = (first + 1 + _pick(digest, 1, len(STOPS) - 1)) % len(STOPS)
    third = (second + 1 + _pick(digest, 2, len(STOPS) - 1)) % len(STOPS)
    return STOPS[first], STOPS[second], STOPS[third]


def angles(seed: str) -> tuple[int, int]:
    """Base angle and a distinctly different overlay angle, both from the seed."""
    digest = _bytes_for(seed)
    base = _pick(digest, 3, 360)
    overlay = (base + 55 + _pick(digest, 4, 180)) % 360
    return base, overlay


def drift(seed: str) -> tuple[int, float]:
    """Reel displacement direction (-1 or 1) and its phase offset in seconds."""
    digest = _bytes_for(seed)
    direction = 1 if _pick(digest, 5, 2) == 0 else -1
    phase = round(_pick(digest, 6, 1200) / 100.0, 2)
    return direction, phase


def _vector(angle: int) -> tuple[str, str, str, str]:
    """Gradient endpoints in objectBoundingBox units for a whole-degree angle.

    Written out as fixed-precision strings so the same angle always renders the
    same characters.
    """
    import math

    radians = math.radians(angle)
    dx = math.cos(radians) / 2.0
    dy = math.sin(radians) / 2.0
    return (
        f"{0.5 - dx:.4f}",
        f"{0.5 - dy:.4f}",
        f"{0.5 + dx:.4f}",
        f"{0.5 + dy:.4f}",
    )


def _grain_defs(prefix: str) -> str:
    return (
        f'<filter id="{prefix}g" x="0" y="0" width="100%" height="100%" '
        f'filterUnits="objectBoundingBox" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{GRAIN_BASE_FREQUENCY}" '
        f'numOctaves="{GRAIN_OCTAVES}" stitchTiles="stitch" seed="7" result="n"/>'
        f'<feColorMatrix in="n" type="saturate" values="0"/>'
        f"</filter>"
        f'<pattern id="{prefix}t" width="{GRAIN_TILE}" height="{GRAIN_TILE}" '
        f'patternUnits="userSpaceOnUse">'
        f'<rect width="{GRAIN_TILE}" height="{GRAIN_TILE}" filter="url(#{prefix}g)"/>'
        f"</pattern>"
    )


def still_svg(seed: str, width: int, height: int, role: str = "poster") -> str:
    """A still: two gradients and the grain.  Nothing else is drawn."""
    width = max(1, int(width))
    height = max(1, int(height))
    prefix = hashlib.sha256(f"{seed}:{width}:{height}:{role}".encode("utf-8")).hexdigest()[:8]
    first, second, third = palette(seed)
    base_angle, overlay_angle = angles(seed)
    bx1, by1, bx2, by2 = _vector(base_angle)
    ox1, oy1, ox2, oy2 = _vector(overlay_angle)

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" preserveAspectRatio="xMidYMid slice">'
        f"<defs>"
        f'<linearGradient id="{prefix}b" x1="{bx1}" y1="{by1}" x2="{bx2}" y2="{by2}">'
        f'<stop offset="0" stop-color="{first}"/>'
        f'<stop offset="1" stop-color="{second}"/>'
        f"</linearGradient>"
        f'<linearGradient id="{prefix}o" x1="{ox1}" y1="{oy1}" x2="{ox2}" y2="{oy2}">'
        f'<stop offset="0" stop-color="{third}" stop-opacity="0.55"/>'
        f'<stop offset="1" stop-color="{third}" stop-opacity="0"/>'
        f"</linearGradient>"
        f"{_grain_defs(prefix)}"
        f"</defs>"
        f'<rect width="{width}" height="{height}" fill="url(#{prefix}b)"/>'
        f'<rect width="{width}" height="{height}" fill="url(#{prefix}o)" opacity="0.32"/>'
        f'<rect width="{width}" height="{height}" fill="url(#{prefix}t)" opacity="0.06"/>'
        f"</svg>"
    )


def share_svg(wordmark: str) -> str:
    """The share image: dark ground, wordmark centred and optically raised."""
    label = (
        str(wordmark)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" '
        'viewBox="0 0 1200 630" role="img">'
        f'<rect width="1200" height="630" fill="{DARK}"/>'
        f'<text x="600" y="296" fill="{LIGHT}" text-anchor="middle" '
        'font-family="Newsreader Variable, Times New Roman, Times, serif" '
        f'font-size="132" font-weight="300" letter-spacing="-2">{label}</text>'
        "</svg>"
    )


def render(row: dict) -> tuple[str, str]:
    """Render a media row.  Returns (body, content type)."""
    return (
        still_svg(row["seed"], row["width"], row["height"], row.get("role") or "poster"),
        SVG_MIME,
    )


def descriptor(row: dict) -> dict:
    """Everything the front end needs to draw this row itself."""
    direction, phase = drift(row["seed"])
    first, second, third = palette(row["seed"])
    base_angle, overlay_angle = angles(row["seed"])
    return {
        "media_id": row["id"],
        "role": row["role"],
        "seed": row["seed"],
        "width": row["width"],
        "height": row["height"],
        "alt": row["alt"],
        "src": f"/api/media/{row['id']}",
        "stops": [first, second, third],
        "angles": [base_angle, overlay_angle],
        "drift": direction,
        "phase": phase,
    }

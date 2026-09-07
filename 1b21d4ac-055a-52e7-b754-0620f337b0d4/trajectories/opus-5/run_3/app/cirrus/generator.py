"""Zero-asset procedural recipes: stills, the grain tile and the share image.

Nothing is stored. A media row carries a seed and the same seed always draws the
same still, so two requests for one media id return the same image.
"""
import hashlib

# The five supporting values. None of them ever carries text; they exist here as
# generator inputs only.
PALETTE = ["#313236", "#dedede", "#676767", "#333333", "#455e53"]

DARK = "#060403"
LIGHT = "#e9eae4"


def _bytes(seed: str) -> bytes:
    return hashlib.sha256(seed.encode("utf-8")).digest()


def recipe(seed: str) -> dict:
    """Derive the drawing parameters for one seed, deterministically."""
    h = _bytes(seed)
    a = PALETTE[h[0] % len(PALETTE)]
    b = PALETTE[(h[0] % len(PALETTE) + 1 + h[1] % (len(PALETTE) - 1)) % len(PALETTE)]
    c = PALETTE[(h[2] + 3) % len(PALETTE)]
    return {
        "from": a,
        "to": b,
        "overlay": c,
        "angle": h[3] % 360,
        "overlay_angle": (h[4] % 360 + 90) % 360,
        "overlay_strength": 0.18 + (h[5] % 100) / 100 * 0.22,
        "stop": 0.35 + (h[6] % 100) / 100 * 0.3,
        "drift": 1 if h[7] % 2 else -1,
    }


def _vector(angle_deg: int):
    """Gradient coordinates on the unit box for an angle in degrees."""
    import math

    rad = math.radians(angle_deg)
    dx, dy = math.cos(rad), math.sin(rad)
    return (
        round(0.5 - dx / 2, 4),
        round(0.5 - dy / 2, 4),
        round(0.5 + dx / 2, 4),
        round(0.5 + dy / 2, 4),
    )


def still_svg(seed: str, width: int, height: int) -> str:
    r = recipe(seed)
    x1, y1, x2, y2 = _vector(r["angle"])
    ox1, oy1, ox2, oy2 = _vector(r["overlay_angle"])
    uid = hashlib.sha256(seed.encode()).hexdigest()[:8]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" preserveAspectRatio="xMidYMid slice" '
        f'role="img" aria-hidden="true">'
        f"<defs>"
        f'<linearGradient id="g{uid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
        f'<stop offset="0" stop-color="{r["from"]}"/>'
        f'<stop offset="{round(r["stop"], 3)}" stop-color="{r["from"]}" stop-opacity="0.75"/>'
        f'<stop offset="1" stop-color="{r["to"]}"/>'
        f"</linearGradient>"
        f'<linearGradient id="o{uid}" x1="{ox1}" y1="{oy1}" x2="{ox2}" y2="{oy2}">'
        f'<stop offset="0" stop-color="{r["overlay"]}" stop-opacity="{round(r["overlay_strength"], 3)}"/>'
        f'<stop offset="1" stop-color="{r["overlay"]}" stop-opacity="0"/>'
        f"</linearGradient>"
        f"</defs>"
        f'<rect width="{width}" height="{height}" fill="url(#g{uid})"/>'
        f'<rect width="{width}" height="{height}" fill="url(#o{uid})"/>'
        f"</svg>"
    )


GRAIN_TILE = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" '
    'viewBox="0 0 300 300"><filter id="grain" x="0" y="0" width="100%" height="100%">'
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" '
    'stitchTiles="stitch" result="n"/>'
    '<feColorMatrix type="saturate" values="0"/></filter>'
    '<rect width="300" height="300" filter="url(#grain)" opacity="0.42"/></svg>'
)


def share_svg(house_name: str) -> str:
    """1200 x 630, the dark ground and the wordmark, optically raised. No photograph."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" '
        'viewBox="0 0 1200 630">'
        f'<rect width="1200" height="630" fill="{DARK}"/>'
        f'<text x="585.5" y="330" fill="{LIGHT}" font-family="Times New Roman, Times, serif" '
        f'font-size="112" font-weight="300" text-anchor="middle" '
        f'dominant-baseline="middle">{house_name.lower()}</text>'
        "</svg>"
    )

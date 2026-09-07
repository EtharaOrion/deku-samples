"""Every pixel on this site is drawn by the app from a stored seed.

A still is a linear gradient between two of the five supporting values, at an
angle derived from the seed, with a second gradient overlaid at a different
angle at low strength. Nothing else is drawn: no text, no dimensions, no cross.
The grain is one 300px tile generated once and repeated by the front end.
"""
import hashlib

# The still generator's palette. None of these ever carries text.
PALETTE = ["#313236", "#dedede", "#676767", "#333333", "#455e53"]


def _bits(seed: str) -> bytes:
    return hashlib.sha256(("cirrus-still|" + (seed or "")).encode("utf-8")).digest()


def still_svg(seed: str, width: int, height: int) -> str:
    b = _bits(seed)
    a_i = b[0] % len(PALETTE)
    # The second stop is always a different value from the first, and at least
    # one saturated value reaches the field often enough for the colour return
    # to be visible.
    b_i = (a_i + 1 + (b[1] % (len(PALETTE) - 1))) % len(PALETTE)
    c_i = (b_i + 1 + (b[2] % (len(PALETTE) - 1))) % len(PALETTE)
    if b[3] % 3 == 0:
        b_i = PALETTE.index("#455e53")

    angle1 = (b[4] / 255.0) * 360.0
    angle2 = (angle1 + 55.0 + (b[5] / 255.0) * 110.0) % 360.0
    overlay_strength = 0.24 + (b[6] / 255.0) * 0.2
    mid = 0.35 + (b[7] / 255.0) * 0.3

    def vector(deg):
        import math
        r = math.radians(deg)
        dx, dy = math.cos(r), math.sin(r)
        return (
            round(0.5 - dx / 2, 4), round(0.5 - dy / 2, 4),
            round(0.5 + dx / 2, 4), round(0.5 + dy / 2, 4),
        )

    x1, y1, x2, y2 = vector(angle1)
    ox1, oy1, ox2, oy2 = vector(angle2)
    uid = hashlib.sha256((seed or "").encode()).hexdigest()[:8]

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" preserveAspectRatio="xMidYMid slice" '
        f'role="presentation">'
        f'<defs>'
        f'<linearGradient id="g{uid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
        f'<stop offset="0" stop-color="{PALETTE[a_i]}"/>'
        f'<stop offset="{round(mid, 3)}" stop-color="{PALETTE[b_i]}"/>'
        f'<stop offset="1" stop-color="{PALETTE[c_i]}"/>'
        f'</linearGradient>'
        f'<linearGradient id="o{uid}" x1="{ox1}" y1="{oy1}" x2="{ox2}" y2="{oy2}">'
        f'<stop offset="0" stop-color="{PALETTE[c_i]}" stop-opacity="{round(overlay_strength, 3)}"/>'
        f'<stop offset="1" stop-color="{PALETTE[a_i]}" stop-opacity="0"/>'
        f'</linearGradient>'
        f'</defs>'
        f'<rect width="{width}" height="{height}" fill="url(#g{uid})"/>'
        f'<rect width="{width}" height="{height}" fill="url(#o{uid})"/>'
        f'</svg>'
    )


def grain_tile_svg(size: int = 300) -> str:
    """One monochrome tile, generated once and reused everywhere."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}">'
        f'<filter id="grain" x="0" y="0" width="100%" height="100%">'
        f'<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" '
        f'stitchTiles="stitch" result="n"/>'
        f'<feColorMatrix type="saturate" values="0" in="n" result="d"/>'
        f'</filter>'
        f'<rect width="{size}" height="{size}" filter="url(#grain)" opacity="0.5"/>'
        f'</svg>'
    )


def share_image_svg(wordmark: str = "cirrus", width: int = 1200, height: int = 630) -> str:
    """The share card: the dark ground and the wordmark, optically raised. No photograph."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
        f'<rect width="{width}" height="{height}" fill="#060403"/>'
        f'<text x="{width / 2 - 14.5078}" y="{height / 2 + 26}" fill="#e9eae4" '
        f'font-family="Times New Roman, Times, serif" font-size="96" font-weight="300" '
        f'text-anchor="middle">{wordmark}</text>'
        f'</svg>'
    )

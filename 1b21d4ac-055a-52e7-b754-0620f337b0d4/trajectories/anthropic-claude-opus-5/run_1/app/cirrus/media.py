"""Zero-asset still generation.

A media row stores a seed and an intrinsic size; the pixels are drawn from that
seed, deterministically, so two requests for the same media id return the same
image. Nothing is stored and nothing is uploaded.
"""
import hashlib

# The five supporting values. None of them ever carries text.
PALETTE = ["#313236", "#dedede", "#676767", "#333333", "#455e53"]


def _digest(seed: str) -> bytes:
    return hashlib.sha256(("cirrus:" + str(seed)).encode("utf-8")).digest()


def still_params(seed: str) -> dict:
    d = _digest(seed)
    a = d[0] % len(PALETTE)
    b = (a + 1 + (d[1] % (len(PALETTE) - 1))) % len(PALETTE)
    c = (b + 1 + (d[2] % (len(PALETTE) - 1))) % len(PALETTE)
    return {
        "from": PALETTE[a],
        "to": PALETTE[b],
        "overlay": PALETTE[c],
        "angle": (d[3] / 255.0) * 360.0,
        "angle2": (d[4] / 255.0) * 360.0,
        "overlay_strength": 0.18 + (d[5] / 255.0) * 0.22,
        "stop": 0.30 + (d[6] / 255.0) * 0.40,
        "drift": 1 if d[7] % 2 else -1,
    }


def _vector(angle_deg: float):
    import math

    rad = math.radians(angle_deg)
    dx, dy = math.cos(rad), math.sin(rad)
    x1 = 0.5 - dx / 2.0
    y1 = 0.5 - dy / 2.0
    x2 = 0.5 + dx / 2.0
    y2 = 0.5 + dy / 2.0
    return x1, y1, x2, y2


def render_svg(seed: str, width: int, height: int, alt: str = "") -> str:
    p = still_params(seed)
    x1, y1, x2, y2 = _vector(p["angle"])
    o1, oy1, o2, oy2 = _vector(p["angle2"])
    uid = hashlib.sha256(str(seed).encode()).hexdigest()[:10]
    title = (alt or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        'width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{title}">'
        "<title>{title}</title>"
        "<defs>"
        '<linearGradient id="g{uid}" x1="{x1:.4f}" y1="{y1:.4f}" x2="{x2:.4f}" y2="{y2:.4f}">'
        '<stop offset="0" stop-color="{c1}"/>'
        '<stop offset="{stop:.3f}" stop-color="{c2}"/>'
        '<stop offset="1" stop-color="{c1}"/>'
        "</linearGradient>"
        '<linearGradient id="o{uid}" x1="{o1:.4f}" y1="{oy1:.4f}" x2="{o2:.4f}" y2="{oy2:.4f}">'
        '<stop offset="0" stop-color="{c3}" stop-opacity="{os:.3f}"/>'
        '<stop offset="1" stop-color="{c3}" stop-opacity="0"/>'
        "</linearGradient>"
        '<filter id="n{uid}" x="0" y="0" width="100%" height="100%">'
        '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" '
        'stitchTiles="stitch" result="t"/>'
        '<feColorMatrix type="saturate" values="0"/>'
        "</filter>"
        '<pattern id="p{uid}" width="300" height="300" patternUnits="userSpaceOnUse">'
        '<rect width="300" height="300" filter="url(#n{uid})" opacity="0.085"/>'
        "</pattern>"
        "</defs>"
        '<rect width="{w}" height="{h}" fill="url(#g{uid})"/>'
        '<rect width="{w}" height="{h}" fill="url(#o{uid})"/>'
        '<rect width="{w}" height="{h}" fill="url(#p{uid})"/>'
        "</svg>"
    ).format(
        w=width,
        h=height,
        uid=uid,
        x1=x1,
        y1=y1,
        x2=x2,
        y2=y2,
        o1=o1,
        oy1=oy1,
        o2=o2,
        oy2=oy2,
        c1=p["from"],
        c2=p["to"],
        c3=p["overlay"],
        os=p["overlay_strength"],
        stop=p["stop"],
        title=title,
    )


def share_image_svg() -> str:
    """1200 x 630, the dark ground with the wordmark, no photograph."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" '
        'viewBox="0 0 1200 630" role="img" aria-label="Cirrus">'
        '<rect width="1200" height="630" fill="#060403"/>'
        '<text x="600" y="300" text-anchor="middle" fill="#e9eae4" '
        'font-family="Times New Roman, Times, serif" font-size="96" '
        'font-weight="300" letter-spacing="-2">cirrus</text>'
        "</svg>"
    )

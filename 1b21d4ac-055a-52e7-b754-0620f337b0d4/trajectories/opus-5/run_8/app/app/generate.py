"""Zero-asset substitution: every still is drawn from its stored seed.

No binary ships. A still is an SVG of two gradients drawn from the five
supporting values, plus the one repeated grain tile.
"""
import hashlib

PALETTE = ["#313236", "#676767", "#333333", "#455e53", "#dedede"]
GRAIN_TILE = 300


def _stream(seed: int):
    digest = hashlib.sha256(str(int(seed)).encode()).digest()
    i = 0
    while True:
        yield digest[i % len(digest)]
        i += 1
        if i % len(digest) == 0:
            digest = hashlib.sha256(digest).digest()


def recipe(seed: int) -> dict:
    s = _stream(seed)
    a = next(s) % len(PALETTE)
    b = (a + 1 + next(s) % (len(PALETTE) - 1)) % len(PALETTE)
    c = (b + 1 + next(s) % (len(PALETTE) - 1)) % len(PALETTE)
    return {
        "from": PALETTE[a],
        "to": PALETTE[b],
        "over": PALETTE[c],
        "angle": next(s) % 360,
        "angle2": (next(s) % 180) + 90,
        "strength": 0.18 + (next(s) % 40) / 400.0,
        "stop": 0.35 + (next(s) % 30) / 100.0,
    }


def grain_tile_svg() -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="{t}" height="{t}">'
        '<filter id="g" x="0" y="0" width="100%" height="100%">'
        '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4"'
        ' stitchTiles="stitch" result="n"/>'
        '<feColorMatrix type="saturate" values="0" in="n"/>'
        "</filter>"
        '<rect width="{t}" height="{t}" filter="url(#g)" opacity="0.5"/>'
        "</svg>"
    ).format(t=GRAIN_TILE)


def still_svg(seed: int, width: int, height: int, alt: str = "") -> str:
    r = recipe(seed)
    title = (alt or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"'
        ' viewBox="0 0 {w} {h}" role="img" aria-label="{title}">'
        "<defs>"
        '<linearGradient id="a" gradientTransform="rotate({angle} 0.5 0.5)">'
        '<stop offset="0" stop-color="{from_}"/>'
        '<stop offset="1" stop-color="{to}"/></linearGradient>'
        '<linearGradient id="b" gradientTransform="rotate({angle2} 0.5 0.5)">'
        '<stop offset="0" stop-color="{over}" stop-opacity="{strength:.3f}"/>'
        '<stop offset="{stop:.3f}" stop-color="{over}" stop-opacity="0"/>'
        '<stop offset="1" stop-color="{from_}" stop-opacity="{strength:.3f}"/>'
        "</linearGradient>"
        '<filter id="grain" x="0" y="0" width="100%" height="100%">'
        '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4"'
        ' stitchTiles="stitch" result="n"/>'
        '<feColorMatrix type="saturate" values="0"/></filter>'
        "</defs>"
        '<rect width="{w}" height="{h}" fill="url(#a)"/>'
        '<rect width="{w}" height="{h}" fill="url(#b)"/>'
        '<rect width="{w}" height="{h}" filter="url(#grain)" opacity="0.06"/>'
        "</svg>"
    ).format(w=width, h=height, title=title, **{
        "angle": r["angle"], "angle2": r["angle2"], "from_": r["from"],
        "to": r["to"], "over": r["over"], "strength": r["strength"],
        "stop": r["stop"]})


def share_image_svg(wordmark: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"'
        ' viewBox="0 0 1200 630">'
        '<rect width="1200" height="630" fill="#060403"/>'
        '<text x="600" y="301" text-anchor="middle" fill="#e9eae4"'
        ' font-family="Times New Roman, Times, serif" font-size="96"'
        ' font-weight="300">{}</text>'
        "</svg>"
    ).format(wordmark.lower())

"""Procedural stills. A media row carries a seed; the pixels are drawn from it.

Nothing is stored and nothing is uploaded: two requests for the same media id return
the same image because the same seed produces the same gradient pair and angle.
"""
import hashlib

# The five supporting values. None of them ever carries text.
PALETTE = ["#313236", "#dedede", "#676767", "#333333", "#455e53"]


def _rng(seed: str):
    """A tiny deterministic stream of floats derived from the stored seed."""
    state = hashlib.sha256(seed.encode()).digest()
    buf = bytearray(state)
    idx = 0

    def nxt():
        nonlocal state, buf, idx
        if idx >= len(buf):
            state = hashlib.sha256(state).digest()
            buf = bytearray(state)
            idx = 0
        val = buf[idx]
        idx += 1
        return val / 255.0

    return nxt


def still_svg(seed: str, width: int, height: int) -> str:
    r = _rng(seed)
    a = int(r() * len(PALETTE)) % len(PALETTE)
    b = (a + 1 + int(r() * (len(PALETTE) - 1))) % len(PALETTE)
    c = (b + 2) % len(PALETTE)
    ang1 = r() * 360.0
    ang2 = (ang1 + 60 + r() * 120.0) % 360.0
    uid = hashlib.sha1(seed.encode()).hexdigest()[:10]

    def vec(angle):
        import math

        rad = math.radians(angle)
        dx, dy = math.cos(rad) / 2, math.sin(rad) / 2
        return (0.5 - dx, 0.5 - dy, 0.5 + dx, 0.5 + dy)

    x1, y1, x2, y2 = vec(ang1)
    u1, v1, u2, v2 = vec(ang2)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" preserveAspectRatio="xMidYMid slice" role="img">'
        f'<defs>'
        f'<linearGradient id="g1{uid}" x1="{x1:.4f}" y1="{y1:.4f}" x2="{x2:.4f}" y2="{y2:.4f}">'
        f'<stop offset="0" stop-color="{PALETTE[a]}"/>'
        f'<stop offset="1" stop-color="{PALETTE[b]}"/></linearGradient>'
        f'<linearGradient id="g2{uid}" x1="{u1:.4f}" y1="{v1:.4f}" x2="{u2:.4f}" y2="{v2:.4f}">'
        f'<stop offset="0" stop-color="{PALETTE[c]}" stop-opacity="0.55"/>'
        f'<stop offset="0.55" stop-color="{PALETTE[b]}" stop-opacity="0.12"/>'
        f'<stop offset="1" stop-color="{PALETTE[a]}" stop-opacity="0.45"/></linearGradient>'
        f'<filter id="n{uid}" x="0" y="0" width="100%" height="100%">'
        f'<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="{a * 7 + b}"/>'
        f'<feColorMatrix type="saturate" values="0"/></filter>'
        f'</defs>'
        f'<rect width="100%" height="100%" fill="url(#g1{uid})"/>'
        f'<rect width="100%" height="100%" fill="url(#g2{uid})"/>'
        f'<rect width="100%" height="100%" filter="url(#n{uid})" opacity="0.06"/>'
        f'</svg>'
    )


def grain_tile() -> str:
    """One 300px monochrome tile, generated once and repeated everywhere."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">'
        '<filter id="grain" x="0" y="0" width="100%" height="100%">'
        '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="7"/>'
        '<feColorMatrix type="saturate" values="0"/></filter>'
        '<rect width="300" height="300" filter="url(#grain)" opacity="0.5"/></svg>'
    )


def share_image(house_name: str) -> str:
    """1200 x 630 share card: the dark ground and the wordmark, optically raised."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" '
        'viewBox="0 0 1200 630">'
        '<rect width="1200" height="630" fill="#060403"/>'
        f'<text x="600" y="315" text-anchor="middle" fill="#e9eae4" font-size="120" '
        f'font-weight="300" font-family="Times New Roman, Times, serif" '
        f'transform="translate(-14.5078,0)">{house_name.lower()}</text>'
        '</svg>'
    )

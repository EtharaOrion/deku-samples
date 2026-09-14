"""Generated pixels: every still the site shows, drawn from a stored seed.

Two requests for the same media id return the same image: the bytes are a pure
function of the seed and nothing is persisted.
"""
import hashlib
import io
import math

from PIL import Image

PALETTE = ["#313236", "#676767", "#333333", "#455e53", "#dedede"]


def _h(seed: str) -> int:
    return int(hashlib.sha256(seed.encode("utf-8")).hexdigest()[:8], 16)


def _pair(seed: str):
    h = _h(seed)
    a = PALETTE[(h >> 3) % 5]
    b = PALETTE[(h >> 19) % 5]
    if a == b:
        b = PALETTE[(h >> 11) % 5]
    return a, b


def _angle(seed: str) -> float:
    return (_h(seed) % 3600) / 10.0


def _rgb(hexstr):
    return int(hexstr[1:3], 16), int(hexstr[3:5], 16), int(hexstr[5:7], 16)


def still_bytes(seed: str, width: int, height: int) -> bytes:
    """A linear gradient between two palette values at a seed-derived angle."""
    a, b = _pair(seed)
    (ar, ag, ab), (br, bg, bb) = _rgb(a), _rgb(b)
    ax, ay = math.cos(math.radians(_angle(seed))), math.sin(math.radians(_angle(seed)))
    image = Image.new("RGB", (width, height))
    px = image.load()
    rng = _h(seed + "jitter")
    diag = width + height
    for y in range(height):
        for x in range(width):
            t = ((x * ax + y * ay + height) / diag) % 1.0
            jitter = ((rng >> ((x * 5 + y * 3) % 24)) & 1) * 0.02
            t = min(1.0, max(0.0, t + jitter))
            px[x, y] = (int(ar + (br - ar) * t),
                        int(ag + (bg - ag) * t),
                        int(ab + (bb - ab) * t))
    buf = io.BytesIO()
    image.save(buf, format="WEBP", quality=82, method=4)
    return buf.getvalue()


def grain_bytes() -> bytes:
    with open("assets/grain.png", "rb") as fh:
        return fh.read()


def share_bytes() -> bytes:
    with open("assets/share.png", "rb") as fh:
        return fh.read()

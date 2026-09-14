"""The still generator. Every pixel on this site is drawn from a stored seed."""
import hashlib
import io
import random

from PIL import Image, ImageDraw, ImageEnhance

STOPS = ["#313236", "#dedede", "#676767", "#333333", "#455e53"]


def seed_int(seed) -> int:
    if isinstance(seed, int):
        return seed
    return int(hashlib.sha256(str(seed).encode()).hexdigest()[:12], 16)


def _hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _angle(seed, salt=""):
    return (seed_int(f"{seed}{salt}") % 3600) / 10.0


def gradient(size, seed, angle_deg, c1, c2):
    """A two-stop linear gradient: a square ramp rotated to the seed's angle,
    centre-cropped to the target shape. Same field as a per-pixel loop, in
    milliseconds rather than seconds."""
    w, h = size
    side = int(max(w, h) * 1.5) or 8
    ramp = Image.new("RGB", (side, side))
    dr = ImageDraw.Draw(ramp)
    for x in range(side):
        t = x / max(1, side - 1)
        dr.line([(x, 0), (x, side)], fill=(
            int(c1[0] + (c2[0] - c1[0]) * t),
            int(c1[1] + (c2[1] - c1[1]) * t),
            int(c1[2] + (c2[2] - c1[2]) * t)))
    ramp = ramp.rotate(angle_deg % 360, resample=Image.BILINEAR)
    left = (side - w) // 2
    top = (side - h) // 2
    return ramp.crop((left, top, left + w, top + h))


def _prng(seed):
    return random.Random(seed_int(seed))


def make_still(seed, width, height, alt="") -> bytes:
    """Gradient field + low-strength cross gradient + grain. Nothing else."""
    key = (seed_int(seed), width, height)
    cached = _still_cache.get(key)
    if cached is not None:
        return cached
    rng = _prng(seed)
    pick = rng.sample(range(len(STOPS)), 2)
    a = _angle(seed, "a")
    b = (a + rng.randint(35, 145)) % 360
    base = gradient((width, height), seed, a, _hex_to_rgb(STOPS[pick[0]]), _hex_to_rgb(STOPS[pick[1]]))
    cross = gradient((width, height), seed, b, _hex_to_rgb(STOPS[rng.randrange(len(STOPS))]),
                     _hex_to_rgb(STOPS[rng.randrange(len(STOPS))]))
    base = Image.blend(base, cross, 0.16)
    base = ImageEnhance.Contrast(base).enhance(1.04)
    if _grain_tile() is not None:
        g = _grain_tile().resize((width, height))
        base = Image.blend(base, g.convert("RGB"), 0.05)
    buf = io.BytesIO()
    base.save(buf, "PNG", optimize=True)
    data = buf.getvalue()
    if len(_still_cache) > 64:
        _still_cache.clear()
    _still_cache[key] = data
    return data


_still_cache = {}


def make_thumbnail(seed, width, height, target_w):
    img = Image.open(io.BytesIO(make_still(seed, width, height)))
    ratio = target_w / width
    return img.resize((target_w, max(1, int(height * ratio))))


_grain_cache = None


def _grain_tile():
    global _grain_cache
    if _grain_cache is not None:
        return _grain_cache
    try:
        _grain_cache = Image.open("/app/static/media/grain.png").convert("RGB")
    except Exception:
        _grain_cache = None
    return _grain_cache


def preload_grain():
    _grain_tile()


def share_image() -> bytes:
    """1200x630, dark ground, wordmark centred and optically raised."""
    W, H = 1200, 630
    dark = _hex_to_rgb("#060403")
    light = _hex_to_rgb("#e9eae4")
    img = Image.new("RGB", (W, H), dark)
    d = ImageDraw.Draw(img)
    word = "cirrus"
    # no font dependency: draw the word as spaced rounded bars? no - use default bitmap at scale
    # Draw the wordmark with PIL's default font scaled up via paste of rendered text
    font = _display_font(150)
    if font:
        d.text((W / 2, H / 2 - 14), word, font=font, fill=light, anchor="mm")
    else:
        d.rectangle([W / 2 - 200, H / 2 - 40, W / 2 + 200, H / 2 + 40], outline=light, width=3)
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


_font_cache = {}


def _display_font(size):
    try:
        from PIL import ImageFont
        key = f"file:{size}"
        if key not in _font_cache:
            _font_cache[key] = ImageFont.truetype("/app/static/fonts/cirrus-display.woff2", size)
        return _font_cache[key]
    except Exception:
        pass
    try:
        from PIL import ImageFont
        key = f"def:{size}"
        if key not in _font_cache:
            _font_cache[key] = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", size)
        return _font_cache[key]
    except Exception:
        return None

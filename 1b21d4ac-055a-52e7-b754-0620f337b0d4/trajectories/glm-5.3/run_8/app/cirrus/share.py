"""The generated share image: 1200 x 630, the dark ground, the wordmark."""
from __future__ import annotations

import io

from PIL import Image, ImageDraw, ImageFont

from . import media

SHARE_W, SHARE_H = 1200, 630
_CACHE: dict[str, bytes] = {}


def share_image() -> bytes:
    if "png" in _CACHE:
        return _CACHE["png"]
    img = Image.new("RGB", (SHARE_W, SHARE_H), media._rgb(media.GROUND_DARK))
    draw = ImageDraw.Draw(img)
    font = _display_font(int(SHARE_H * 0.11))
    text = "cirrus"
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    # optical raise: the same correction the marks use, ~45% of the cap height
    x = (SHARE_W - w) / 2 - bbox[0]
    y = (SHARE_H - h) / 2 - bbox[1] - h * 0.045
    draw.text((x, y), text, font=font, fill=media._rgb("#e9eae4"))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    _CACHE["png"] = buf.getvalue()
    return _CACHE["png"]


def _display_font(size: int):
    """A scalable stand-in for the share card; the shipped webfonts are WOFF2
    and the image host has no other face. The card's identity is the mark and
    the ground, not the substituted letters."""
    return ImageFont.load_default(size=size)


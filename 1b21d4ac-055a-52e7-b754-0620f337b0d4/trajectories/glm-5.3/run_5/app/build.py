"""Build-time asset generation: subset variable fonts, grain tile, share image.

Run once at authoring time; outputs are committed under assets/ and shipped.
Usage: python build.py [path/to/Cormorant.ttf] [path/to/Archivo.ttf]
"""
import os
import random
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ROOT, "assets")
FONTS = os.path.join(ASSETS, "fonts")

UNICODES = ",".join(
    ["U+0020", "U+0021", "U+0023", "U+0024", "U+0025", "U+0026", "U+0027",
     "U+0028", "U+0029", "U+002A", "U+002B", "U+002C", "U+002D", "U+002E",
     "U+002F", "U+0030-0039", "U+003A", "U+003B", "U+003C", "U+003D",
     "U+003E", "U+003F", "U+0040", "U+0041-005A", "U+005B", "U+005D",
     "U+005E", "U+005F", "U+0060", "U+0061-007A", "U+007B", "U+007C",
     "U+007D", "U+007E", "U+2010", "U+2013", "U+2014", "U+2018", "U+2019",
     "U+201C", "U+201D", "U+00C0-00FF", "U+00E9"])


def subset(src: str, out: str) -> None:
    subprocess.run([
        sys.executable, "-m", "fontTools.subset", src,
        f"--unicodes={UNICODES}", "--flavor=woff2",
        "--layout-features=kern,liga", "--no-hinting", "--desubroutinize",
        f"--output-file={out}",
    ], check=True)


def build_grain(tile: int = 300, octaves: int = 4, base: float = 0.9) -> None:
    """Fractal monochrome noise, one tile, very low strength."""
    size = tile * tile
    freq = base
    layers = []
    for _ in range(octaves):
        lo = int(128 - 127 * 0.5 / freq)
        data = [random.randint(lo, 255 - lo) for _ in range(size)]
        layer = Image.new("L", (tile, tile))
        layer.putdata(data)
        if freq != base:
            layer = layer.resize((int(tile / freq), int(tile / freq)), Image.BILINEAR)
        layers.append((layer, 1.0 / freq))
        freq /= 2.0
    out = Image.new("L", (tile, tile))
    px = out.load()
    total = sum(w for _, w in layers)
    loaded = [(layer.load(), layer.width, layer.height, w) for layer, w in layers]
    for y in range(tile):
        for x in range(tile):
            v = 0
            for get, lw, lh, w in loaded:
                v += get[x % lw, y % lh] * w
            px[x, y] = int(v / total)
    out.save(os.path.join(ASSETS, "grain.png"), optimize=True)


def build_share(font_path: str) -> None:
    im = Image.new("RGB", (1200, 630), "#060403")
    if font_path and os.path.exists(font_path):
        font = ImageFont.truetype(font_path, 150)
        d = ImageDraw.Draw(im)
        text = "Cirrus"
        box = d.textbbox((0, 0), text, font=font)
        w = box[2] - box[0]
        h = box[3] - box[1]
        # optical raise: sit the wordmark slightly above the true centre
        x = (1200 - w) / 2 - box[0]
        y = (630 - h) / 2 - box[1] - 20
        d.text((x, y), text, font=font, fill="#e9eae4")
    im.save(os.path.join(ASSETS, "share.png"), optimize=True)


if __name__ == "__main__":
    os.makedirs(FONTS, exist_ok=True)
    serif = sys.argv[1] if len(sys.argv) > 1 else "/tmp/Cormorant.ttf"
    grotesk = sys.argv[2] if len(sys.argv) > 2 else "/tmp/Archivo.ttf"
    if os.path.exists(serif):
        subset(serif, os.path.join(FONTS, "cirrus-display.woff2"))
    if os.path.exists(grotesk):
        subset(grotesk, os.path.join(FONTS, "cirrus-text.woff2"))
    build_grain()
    build_share(serif if os.path.exists(serif) else "")
    for f in sorted(os.listdir(FONTS)):
        print("font", f, os.path.getsize(os.path.join(FONTS, f)))
    print("grain", os.path.getsize(os.path.join(ASSETS, "grain.png")))
    print("share", os.path.getsize(os.path.join(ASSETS, "share.png")))

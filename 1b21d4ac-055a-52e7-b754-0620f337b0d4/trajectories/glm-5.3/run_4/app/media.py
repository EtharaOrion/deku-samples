"""Every pixel on this site is drawn by the app from a stored seed."""
import hashlib
import io
import os

STOPS = ["#313236", "#676767", "#333333", "#455e53", "#dedede"]
GRAIN_STRENGTH = 0.05


def _int(seed: str) -> int:
    return int(seed[:16], 16)


def _n(seed: str, i: int) -> float:
    h = hashlib.sha256(f"{seed}:{i}".encode()).digest()
    return int.from_bytes(h[:4], "big") / 4294967295.0


def still_svg(seed: str, width: int, height: int) -> str:
    """A gradient field between two of the five supporting colours, with a second
    overlay gradient at low strength. Nothing else is drawn."""
    w = max(1, int(width))
    h = max(1, int(height))
    a = STOPS[int(_n(seed, 1) * len(STOPS))]
    b = STOPS[int(_n(seed, 2) * len(STOPS))]
    while b == a and len(STOPS) > 1:
        b = STOPS[(STOPS.index(b) + 1) % len(STOPS)]
    x1, y1 = _n(seed, 3), _n(seed, 4)
    x2, y2 = (1 - y1), (1 - x1)
    c, d = STOPS[int(_n(seed, 5) * len(STOPS))], STOPS[int(_n(seed, 6) * len(STOPS))]
    ox1, oy1, ox2, oy2 = _n(seed, 7), _n(seed, 8), 1 - _n(seed, 8), 1 - _n(seed, 7)
    strength = round(0.14 + 0.1 * _n(seed, 9), 3)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img">
<defs>
<linearGradient id="g" x1="{x1:.4f}" y1="{y1:.4f}" x2="{x2:.4f}" y2="{y2:.4f}">
<stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/>
</linearGradient>
<linearGradient id="o" x1="{ox1:.4f}" y1="{oy1:.4f}" x2="{ox2:.4f}" y2="{oy2:.4f}">
<stop offset="0" stop-color="{c}" stop-opacity="{strength}"/>
<stop offset="1" stop-color="{d}" stop-opacity="0"/>
</linearGradient>
</defs>
<rect width="{w}" height="{h}" fill="url(#g)"/>
<rect width="{w}" height="{h}" fill="url(#o)"/>
</svg>"""


def serve_still(conn, m):
    from flask import Response
    svg = still_svg(m["seed"], m["width"], m["height"]).encode()
    resp = Response(svg, mimetype="image/svg+xml")
    resp.headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=600"
    return resp


# ---------------------------------------------------------------- grain tile

def _value_noise_tile(size=300, freq=0.9, octaves=4, seed=7):
    """Fractal noise over four octaves, all colour removed, at base frequency ~0.9."""
    import random
    rnd = random.Random(seed)
    grids = []
    for o in range(octaves):
        cells = max(2, int(freq * (2 ** o) * 8))
        grids.append([[rnd.random() for _ in range(cells + 1)] for _ in range(cells + 1)])
    tile = [[0.0] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            amp = 1.0
            total = 0.0
            norm = 0.0
            for g in grids:
                cells = len(g) - 1
                fx = x / size * cells
                fy = y / size * cells
                ix, iy = int(fx), int(fy)
                tx, ty = fx - ix, fy - iy
                sx = tx * tx * (3 - 2 * tx)
                sy = ty * ty * (3 - 2 * ty)
                v00 = g[iy % (cells + 1)][ix % (cells + 1)]
                v10 = g[iy % (cells + 1)][(ix + 1) % (cells + 1)]
                v01 = g[(iy + 1) % (cells + 1)][ix % (cells + 1)]
                v11 = g[(iy + 1) % (cells + 1)][(ix + 1) % (cells + 1)]
                total += amp * ((v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy)
                norm += amp
                amp *= 0.5
            tile[y][x] = total / norm
    return tile


# ---------------------------------------------------------------- png, no library

def write_png(path, width, height, rows):
    """A minimal PNG writer: zlib over filtered scanlines, no dependencies."""
    import struct
    import zlib
    raw = bytearray()
    for row in rows:
        raw.append(0)
        for px in row:
            raw.extend(px if isinstance(px, (tuple, list)) else (px,))
    def chunk(tag, body):
        out = struct.pack(">I", len(body)) + tag + body
        return out + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    data = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n")
        fh.write(chunk(b"IHDR", header))
        fh.write(chunk(b"IDAT", data))
        fh.write(chunk(b"IEND", b""))


def _grey_rows(tile, size=300):
    return [[(int(v * 255),) * 3 for v in row] for row in tile]


_GEN_DIR = os.path.join(os.path.dirname(__file__), "static", "gen")
_GRAIN = os.path.join(_GEN_DIR, "grain.png")
_SHARE = os.path.join(_GEN_DIR, "share.png")


def build_grain_tile():
    """One 300px monochrome tile, generated once and reused everywhere."""
    if os.path.exists(_GRAIN):
        return _GRAIN
    tile = _value_noise_tile()
    rows = [[(int(v * 255),) * 3 for v in row] for row in tile]
    os.makedirs(_GEN_DIR, exist_ok=True)
    write_png(_GRAIN, 300, 300, rows)
    return _GRAIN


def grain_tile():
    build_grain_tile()
    return _file_response(_GRAIN, "image/png")


def build_share_image():
    """1200 x 630, the dark ground with the wordmark centred and optically raised."""
    if os.path.exists(_SHARE):
        return _SHARE
    rows = _wordmark_rows("cirrus", 1200, 630)
    os.makedirs(_GEN_DIR, exist_ok=True)
    write_png(_SHARE, 1200, 630, rows)
    return _SHARE


def share_image():
    build_share_image()
    return _file_response(_SHARE, "image/png", cache=True)


# a five-by-seven bitmap of lowercase letters, enough for the wordmark
_GLYPHS = {
    "c": [" 011 ", "1   1", "1    ", "1    ", "1   1", " 011 ", "     "],
    "i": ["  1  ", "     ", "  1  ", "  1  ", "  1  ", "  1  ", "     "],
    "r": ["11   ", "1  1 ", "1  1 ", "11   ", "1  1 ", "1  1 ", "     "],
    "u": ["1   1", "1   1", "1   1", "1   1", "1   1", " 111 ", "     "],
    "s": [" 111 ", "1    ", " 11  ", "   1 ", "1   1", " 111 ", "     "],
}
_DARK = (6, 4, 3)
_LIGHT = (233, 234, 228)


def _wordmark_rows(word, width, height):
    """The dark ground with the lowercase wordmark centred and optically raised."""
    scale = 16
    cols = sum(len(_GLYPHS[ch][0]) + 3 for ch in word) - 3
    rows = []
    cell = scale // 2 or 1
    w = cols * cell
    h = 7 * scale
    left = (width - w) // 2
    top = (height - h) // 2 - 16
    for y in range(height):
        row = []
        for x in range(width):
            gx = (x - left) // cell
            gy = (y - top) // scale
            if 0 <= gy < 7 and 0 <= gx < cols:
                px = x - left - gx * cell
                py = y - top - gy * scale
                ch_index = 0
                remaining = gx
                hit = False
                for ch in word:
                    gw = len(_GLYPHS[ch][0])
                    if remaining < gw:
                        hit = _GLYPHS[ch][gy][remaining] == "1"
                        break
                    remaining -= gw + 3
                if hit:
                    row.append(_LIGHT)
                    continue
            row.append(_DARK)
        rows.append(row)
    return rows


def _file_response(path, mimetype, cache=True):
    from flask import Response, send_file
    if not os.path.exists(path):
        return Response("", status=404)
    resp = send_file(path, mimetype=mimetype, conditional=True)
    resp.cache_control.public = True
    resp.cache_control.max_age = 86400
    return resp


def build_static_assets():
    """Generate the grain tile and the share image once, at start."""
    os.makedirs(_GEN_DIR, exist_ok=True)
    build_grain_tile()
    build_share_image()

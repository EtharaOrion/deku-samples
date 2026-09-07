#!/usr/bin/env python3
"""
Generates the workshop-table film and its still frame.

Everything here is drawn from scratch with PIL and encoded with ffmpeg, so the
asset is ours to ship. It is scenery and never information: a lit table top, a
few tools laid on it, and a slow drift of light across the surface.
"""
import math
import os
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/app/public/media")
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1280, 720
FPS = 24
SECONDS = 12
FRAMES = FPS * SECONDS

random.seed(20260601)

INK = (20, 17, 15)
TABLE_BASE = (74, 58, 44)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def build_table():
    """The table top: a warm plane with a wood grain drawn into it."""
    img = Image.new("RGB", (W, H), TABLE_BASE)
    d = ImageDraw.Draw(img)

    # Long grain running across the table, slightly wandering.
    y = -20.0
    while y < H + 20:
        amp = random.uniform(1.5, 6.0)
        phase = random.uniform(0, math.tau)
        freq = random.uniform(0.0016, 0.0042)
        shade = random.uniform(-0.16, 0.13)
        base = mix(TABLE_BASE, (255, 236, 205) if shade > 0 else (26, 18, 12), abs(shade))
        width = random.choice([1, 1, 1, 2])
        pts = []
        for x in range(0, W + 8, 8):
            pts.append((x, y + math.sin(x * freq + phase) * amp))
        d.line(pts, fill=base, width=width, joint="curve")
        y += random.uniform(3.0, 9.5)

    # A few knots so the grain reads as timber rather than as stripes.
    for _ in range(7):
        cx, cy = random.uniform(0, W), random.uniform(0, H)
        for ring in range(random.randint(4, 9)):
            rx = 7 + ring * random.uniform(3.5, 6.0)
            ry = rx * random.uniform(0.45, 0.7)
            d.ellipse(
                [cx - rx, cy - ry, cx + rx, cy + ry],
                outline=mix(TABLE_BASE, (24, 16, 11), 0.30),
                width=1,
            )

    img = img.filter(ImageFilter.GaussianBlur(0.6))

    # Board seams.
    d = ImageDraw.Draw(img)
    for sx in (int(W * 0.31), int(W * 0.68)):
        jitter = [(sx + math.sin(yy * 0.01) * 2.0, yy) for yy in range(0, H + 4, 4)]
        d.line(jitter, fill=mix(TABLE_BASE, (18, 12, 8), 0.55), width=2, joint="curve")
        d.line([(x + 2, y) for x, y in jitter], fill=mix(TABLE_BASE, (255, 240, 210), 0.10), width=1, joint="curve")
    return img


def draw_tools(img):
    """A cutting mat, a rule, a driver and two lens caps. Shapes, not brands."""
    d = ImageDraw.Draw(img, "RGBA")

    # Cutting mat, bottom left.
    mat = [int(W * 0.04), int(H * 0.60), int(W * 0.52), int(H * 0.99)]
    d.rounded_rectangle(mat, radius=8, fill=(31, 48, 43, 255))
    for gx in range(mat[0] + 24, mat[2] - 8, 24):
        d.line([(gx, mat[1] + 10), (gx, mat[3] - 10)], fill=(255, 255, 255, 16), width=1)
    for gy in range(mat[1] + 22, mat[3] - 8, 24):
        d.line([(mat[0] + 10, gy), (mat[2] - 10, gy)], fill=(255, 255, 255, 16), width=1)

    # Steel rule across the middle.
    rule = [int(W * 0.10), int(H * 0.455), int(W * 0.86), int(H * 0.505)]
    d.rounded_rectangle(rule, radius=3, fill=(150, 152, 155, 255))
    d.rounded_rectangle([rule[0], rule[1], rule[2], rule[1] + 6], radius=3, fill=(198, 200, 202, 255))
    for i, tx in enumerate(range(rule[0] + 14, rule[2] - 8, 15)):
        long_tick = i % 5 == 0
        d.line(
            [(tx, rule[3] - (16 if long_tick else 9)), (tx, rule[3] - 3)],
            fill=(58, 60, 62, 255),
            width=1,
        )

    # A driver handle and shaft, laid at an angle.
    d.polygon(
        [(int(W * 0.60), int(H * 0.70)), (int(W * 0.74), int(H * 0.64)),
         (int(W * 0.75), int(H * 0.685)), (int(W * 0.61), int(H * 0.745))],
        fill=(38, 36, 34, 255),
    )
    d.polygon(
        [(int(W * 0.74), int(H * 0.648)), (int(W * 0.90), int(H * 0.585)),
         (int(W * 0.905), int(H * 0.607)), (int(W * 0.748), int(H * 0.671))],
        fill=(176, 178, 180, 255),
    )

    # Two lens caps.
    for cx, cy, r in ((int(W * 0.63), int(H * 0.30), 46), (int(W * 0.80), int(H * 0.36), 33)):
        d.ellipse([cx - r, cy - r * 0.82, cx + r, cy + r * 0.82], fill=(26, 24, 22, 255))
        d.ellipse(
            [cx - r * 0.72, cy - r * 0.58, cx + r * 0.72, cy + r * 0.58],
            outline=(92, 88, 84, 255), width=2,
        )

    # A loose screw or two.
    for sx, sy in ((int(W * 0.47), int(H * 0.24)), (int(W * 0.52), int(H * 0.30)), (int(W * 0.30), int(H * 0.20))):
        d.ellipse([sx - 5, sy - 4, sx + 5, sy + 4], fill=(142, 140, 136, 255))
        d.line([(sx - 3, sy), (sx + 3, sy)], fill=(60, 58, 56, 255), width=1)

    # Paper offcut, top left, catching the light.
    d.polygon(
        [(int(W * 0.06), int(H * 0.08)), (int(W * 0.29), int(H * 0.05)),
         (int(W * 0.31), int(H * 0.27)), (int(W * 0.08), int(H * 0.30))],
        fill=(226, 219, 205, 255),
    )
    return img


def light_mask(t):
    """A soft key light drifting slowly across the table."""
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    cx = W * (0.30 + 0.40 * (0.5 + 0.5 * math.sin(t * math.tau)))
    cy = H * (0.20 + 0.10 * math.sin(t * math.tau * 0.5 + 1.0))
    rings = 34
    for i in range(rings, 0, -1):
        f = i / rings
        rx = W * 0.95 * f
        ry = H * 0.98 * f
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=int(238 * (1.0 - f) ** 1.55))
    return mask.filter(ImageFilter.GaussianBlur(58))


def vignette():
    v = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(v)
    steps = 44
    for i in range(steps, 0, -1):
        f = i / steps
        d.ellipse(
            [W * 0.5 - W * 0.86 * f, H * 0.5 - H * 0.96 * f,
             W * 0.5 + W * 0.86 * f, H * 0.5 + H * 0.96 * f],
            fill=int(226 * (1 - f) ** 1.15),
        )
    return v.filter(ImageFilter.GaussianBlur(70))


def compose(base, t, vig):
    lit = Image.new("RGB", (W, H), (255, 243, 222))
    frame = Image.composite(
        Image.blend(base, lit, 0.42),
        Image.blend(base, Image.new("RGB", (W, H), INK), 0.46),
        light_mask(t),
    )
    frame = Image.composite(Image.blend(frame, Image.new("RGB", (W, H), INK), 0.62), frame, vig)
    return frame


def main():
    print("drawing the table")
    base = draw_tools(build_table())
    vig = vignette()

    frames_dir = Path("/tmp/vela-frames")
    frames_dir.mkdir(parents=True, exist_ok=True)
    for f in frames_dir.glob("*.png"):
        f.unlink()

    print(f"rendering {FRAMES} frames")
    for i in range(FRAMES):
        # The loop is continuous: t returns to its start so the film never jumps.
        t = i / FRAMES
        compose(base, t, vig).save(frames_dir / f"f{i:04d}.png")

    # The still frame is the first frame, so the dissolve to the film is exact.
    poster = compose(base, 0.0, vig)
    poster.save(OUT / "table-still.jpg", quality=82, optimize=True, progressive=True)
    print("wrote table-still.jpg")

    common = [
        "-y", "-loglevel", "error",
        "-framerate", str(FPS),
        "-i", str(frames_dir / "f%04d.png"),
    ]
    subprocess.run(
        ["ffmpeg", *common, "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
         "-crf", "30", "-movflags", "+faststart", "-an", str(OUT / "table.mp4")],
        check=True,
    )
    print("wrote table.mp4")
    subprocess.run(
        ["ffmpeg", *common, "-c:v", "libvpx-vp9", "-crf", "42", "-b:v", "0",
         "-row-mt", "1", "-an", str(OUT / "table.webm")],
        check=True,
    )
    print("wrote table.webm")

    for f in frames_dir.glob("*.png"):
        f.unlink()

    for name in ("table-still.jpg", "table.mp4", "table.webm"):
        p = OUT / name
        print(f"{name}: {p.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()

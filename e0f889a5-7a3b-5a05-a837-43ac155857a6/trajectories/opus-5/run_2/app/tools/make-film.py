#!/usr/bin/env python3
"""
Generate the workshop-table film and its still frame.

Everything here is drawn from scratch with PIL: no photographer's work, no stock
footage, no brand assets. The film is scenery and never information, so a slow
generated pan over an abstract table of parts is a complete rendering.
"""
import math
import os
import random
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 720
FPS = 24
SECONDS = 12
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'media')

random.seed(1826)

TABLE = (58, 47, 38)
TABLE_LIGHT = (96, 78, 60)
METAL = (150, 149, 145)
DARK_METAL = (74, 74, 72)
BRASS = (168, 130, 62)
PAPER = (206, 198, 182)


def lerp(a, b, t):
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


def wood_ground(w, h):
    img = Image.new('RGB', (w, h), TABLE)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        for band in range(0, w, 64):
            tx = band / max(1, w)
            shade = lerp(TABLE_LIGHT, TABLE, min(1.0, (t * 0.85 + tx * 0.5)))
            d.rectangle([band, y, band + 64, y + 1], fill=shade)
    for _ in range(w // 2):
        y = random.randrange(h)
        x = random.randrange(-40, w)
        length = random.randrange(120, 420)
        tone = random.randint(-14, 12)
        col = tuple(max(0, min(255, c + tone)) for c in TABLE)
        d.line([(x, y), (x + length, y + random.randint(-2, 2))], fill=col, width=1)
    return img.filter(ImageFilter.GaussianBlur(0.6))


def draw_parts(img):
    d = ImageDraw.Draw(img, 'RGBA')

    def plate(x, y, w, h, col, radius=8, shadow=True):
        if shadow:
            d.rounded_rectangle([x + 4, y + 6, x + w + 4, y + h + 6], radius=radius, fill=(0, 0, 0, 70))
        d.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=col)

    plate(120, 150, 300, 190, DARK_METAL, radius=14)
    d.rounded_rectangle([150, 180, 250, 250], radius=6, fill=(52, 52, 51))
    d.ellipse([300, 190, 396, 286], fill=(38, 38, 37))
    d.ellipse([316, 206, 380, 270], fill=(24, 24, 24))
    d.ellipse([332, 222, 364, 254], fill=(96, 104, 112))
    for sx, sy in [(140, 168), (400, 168), (140, 322), (400, 322)]:
        d.ellipse([sx - 5, sy - 5, sx + 5, sy + 5], fill=(120, 120, 118))
        d.line([(sx - 3, sy), (sx + 3, sy)], fill=(60, 60, 58), width=2)

    d.ellipse([700, 300, 940, 540], fill=(30, 30, 30))
    d.ellipse([716, 316, 924, 524], fill=(46, 46, 46))
    d.ellipse([760, 360, 880, 480], fill=(16, 18, 22))
    d.ellipse([784, 384, 856, 456], fill=(58, 74, 92))
    d.arc([700, 300, 940, 540], start=200, end=340, fill=(150, 150, 148), width=3)

    d.ellipse([520, 120, 640, 240], outline=BRASS, width=10)
    for i in range(9):
        a = i * (2 * math.pi / 9)
        cx, cy = 580 + math.cos(a) * 78, 180 + math.sin(a) * 78
        d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=METAL)

    d.polygon([(150, 470), (430, 440), (470, 600), (180, 630)], fill=PAPER)
    for i in range(6):
        y = 480 + i * 22
        d.line([(180, y), (420, y - 6)], fill=(150, 143, 128), width=2)

    for _ in range(14):
        x = random.randrange(460, 1180)
        y = random.randrange(540, 690)
        r = random.randrange(4, 8)
        d.ellipse([x + 2, y + 3, x + 2 * r + 2, y + 2 * r + 3], fill=(0, 0, 0, 60))
        d.ellipse([x, y, x + 2 * r, y + 2 * r], fill=METAL)
        d.line([(x + r * 0.5, y + r), (x + r * 1.5, y + r)], fill=(70, 70, 68), width=2)

    d.rectangle([980, 120, 1030, 620], fill=(168, 170, 172))
    for i in range(26):
        y = 130 + i * 19
        long = i % 5 == 0
        d.line([(980, y), (980 + (22 if long else 12), y)], fill=(70, 72, 74), width=2)
    return img


def build_master():
    master = wood_ground(int(W * 1.35), int(H * 1.2))
    master = draw_parts(master)
    vig = Image.new('L', master.size, 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-master.size[0] * 0.15, -master.size[1] * 0.2,
                master.size[0] * 1.15, master.size[1] * 1.2], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(160))
    dark = Image.new('RGB', master.size, (12, 10, 8))
    return Image.composite(master, dark, vig)


def main():
    os.makedirs(OUT, exist_ok=True)
    master = build_master()
    mw, mh = master.size

    frames_dir = os.path.join(OUT, '_frames')
    os.makedirs(frames_dir, exist_ok=True)

    total = FPS * SECONDS
    for i in range(total):
        t = i / (total - 1)
        eased = 0.5 - 0.5 * math.cos(math.pi * 2 * t)
        x = int((mw - W) * eased)
        y = int((mh - H) * (0.25 + 0.5 * eased))
        master.crop((x, y, x + W, y + H)).save(os.path.join(frames_dir, 'f%04d.png' % i))

    top = int((mh - H) * 0.25)
    master.crop((0, top, W, top + H)).save(os.path.join(OUT, 'table-still.jpg'), quality=82, optimize=True)

    common = ['-y', '-framerate', str(FPS), '-i', os.path.join(frames_dir, 'f%04d.png')]
    subprocess.run(['ffmpeg', *common, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                    '-profile:v', 'main', '-crf', '30', '-movflags', '+faststart', '-an',
                    os.path.join(OUT, 'table.mp4')], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['ffmpeg', *common, '-c:v', 'libvpx-vp9', '-crf', '44', '-b:v', '0',
                    '-an', os.path.join(OUT, 'table.webm')], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    for f in os.listdir(frames_dir):
        os.remove(os.path.join(frames_dir, f))
    os.rmdir(frames_dir)

    for name in ('table.mp4', 'table.webm', 'table-still.jpg'):
        p = os.path.join(OUT, name)
        print('%s: %s bytes' % (name, format(os.path.getsize(p), ',')))


if __name__ == '__main__':
    sys.exit(main())

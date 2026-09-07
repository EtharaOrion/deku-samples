"""Generate the workshop-table film and its still frame.

Everything here is drawn procedurally, so the asset is ours to ship: a dark
wooden surface seen from above, a few tools and a camera body in pieces, with a
slow drift of light across it. No photograph and no third-party asset.
"""
import math, random
from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 720
random.seed(20260601)

def base_table():
    img = Image.new('RGB', (W, H), (34, 29, 25))
    d = ImageDraw.Draw(img)
    # wood grain: long horizontal bands with slight waver
    for y in range(-20, H + 20, 3):
        tone = 34 + int(10 * math.sin(y * 0.05)) + random.randint(-5, 5)
        d.line([(0, y), (W, y)], fill=(tone + 6, tone, tone - 4), width=2)
    for _ in range(70):
        y = random.randint(0, H)
        amp = random.uniform(1.5, 6)
        pts = [(x, y + amp * math.sin(x * random.uniform(0.002, 0.006))) for x in range(0, W + 10, 10)]
        tone = random.randint(20, 44)
        d.line(pts, fill=(tone + 8, tone + 2, tone - 3), width=random.choice([1, 1, 2]))
    # a few knots
    for _ in range(5):
        cx, cy = random.randint(0, W), random.randint(0, H)
        for r in range(26, 0, -3):
            t = 26 + r
            d.ellipse([cx - r * 2, cy - r, cx + r * 2, cy + r], outline=(t + 8, t + 1, t - 5), width=2)
    return img.filter(ImageFilter.GaussianBlur(0.6))

def tools(img):
    d = ImageDraw.Draw(img, 'RGBA')
    # screwdriver, lying at an angle, lower left
    d.polygon([(180, 620), (330, 560), (338, 574), (188, 634)], fill=(96, 92, 88, 255))
    d.polygon([(330, 560), (392, 536), (402, 560), (338, 574)], fill=(58, 52, 60, 255))
    # small parts tray, upper right
    d.rounded_rectangle([880, 120, 1160, 300], radius=14, fill=(44, 42, 44, 255), outline=(74, 70, 66, 255), width=3)
    for i in range(3):
        for j in range(2):
            x0 = 900 + i * 88; y0 = 142 + j * 78
            d.rounded_rectangle([x0, y0, x0 + 70, y0 + 60], radius=6, outline=(70, 66, 62, 255), width=2)
    # screws in the tray
    for _ in range(14):
        x = random.randint(905, 1140); y = random.randint(148, 288)
        d.ellipse([x, y, x + 7, y + 7], fill=(150, 146, 138, 255))
        d.line([(x + 1, y + 3), (x + 6, y + 4)], fill=(70, 68, 64, 255))
    # camera body in pieces, centre-left
    d.rounded_rectangle([430, 300, 700, 470], radius=16, fill=(40, 39, 42, 255), outline=(86, 84, 82, 255), width=3)
    d.ellipse([505, 330, 625, 442], fill=(26, 26, 30, 255), outline=(96, 94, 92, 255), width=4)
    d.ellipse([531, 356, 599, 416], fill=(18, 18, 22, 255), outline=(64, 64, 70, 255), width=2)
    # the back plate, removed and set beside it
    d.rounded_rectangle([730, 360, 900, 500], radius=12, fill=(38, 37, 40, 255), outline=(80, 78, 76, 255), width=3)
    d.rounded_rectangle([752, 382, 878, 466], radius=6, fill=(30, 30, 34, 255), outline=(60, 58, 58, 255), width=2)
    # a ribbon cable, the part the letter is about
    pts = [(700, 400), (726, 392), (742, 410), (734, 436), (748, 452)]
    d.line(pts, fill=(150, 116, 60, 255), width=7)
    d.line(pts, fill=(178, 142, 78, 200), width=3)
    # loupe, bottom right
    d.ellipse([980, 470, 1120, 610], outline=(92, 88, 84, 255), width=6)
    d.ellipse([996, 486, 1104, 594], fill=(52, 54, 58, 190))
    # notebook, top left
    d.polygon([(90, 120), (340, 92), (356, 236), (106, 264)], fill=(58, 55, 50, 255), outline=(88, 84, 78, 255))
    for i in range(6):
        d.line([(112 + i * 2, 150 + i * 16), (330, 130 + i * 16)], fill=(84, 80, 74, 200), width=2)
    return img

def vignette(img, phase=0.0):
    """A soft pool of light that drifts, plus a vignette."""
    light = Image.new('L', (W, H), 0)
    ld = ImageDraw.Draw(light)
    cx = W * (0.42 + 0.10 * math.sin(phase))
    cy = H * (0.40 + 0.06 * math.cos(phase * 0.8))
    for r in range(520, 0, -8):
        v = int(150 * (1 - r / 520) ** 1.6)
        ld.ellipse([cx - r * 1.35, cy - r, cx + r * 1.35, cy + r], fill=v)
    light = light.filter(ImageFilter.GaussianBlur(60))
    warm = Image.new('RGB', (W, H), (255, 226, 178))
    img = Image.composite(Image.blend(img, warm, 0.30), img, light)

    vg = Image.new('L', (W, H), 0)
    vd = ImageDraw.Draw(vg)
    for r in range(760, 0, -10):
        v = int(255 * (1 - r / 760) ** 0.9)
        vd.ellipse([W/2 - r*1.2, H/2 - r*0.95, W/2 + r*1.2, H/2 + r*0.95], fill=v)
    vg = vg.filter(ImageFilter.GaussianBlur(80))
    dark = Image.new('RGB', (W, H), (10, 9, 11))
    return Image.composite(img, dark, vg)

table = tools(base_table())
still = vignette(table.copy(), 0.0)
still.save('/app/public/media/table-still.jpg', quality=82, optimize=True)
print('still ok')

frames = 96
for i in range(frames):
    ph = (i / frames) * 2 * math.pi
    f = vignette(table.copy(), ph)
    f.save(f'/tmp/frames/f{i:04d}.png')

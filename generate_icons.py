#!/usr/bin/env python3
"""Generate NoteVault PWA icons using Pillow"""

from PIL import Image, ImageDraw, ImageFont
import os

SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
OUTPUT_DIR = "icons"
os.makedirs(OUTPUT_DIR, exist_ok=True)

BG = (13, 13, 20)
ACCENT = (244, 197, 66)
ACCENT2 = (224, 108, 240)

def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rect background
    r = size // 5
    draw.rounded_rectangle([0, 0, size, size], radius=r, fill=BG)

    # Gradient accent bar at top
    bar_h = max(4, size // 20)
    for x in range(size):
        t = x / size
        r2 = int(ACCENT[0] * (1-t) + ACCENT2[0] * t)
        g2 = int(ACCENT[1] * (1-t) + ACCENT2[1] * t)
        b2 = int(ACCENT[2] * (1-t) + ACCENT2[2] * t)
        draw.rectangle([x, 0, x+1, bar_h], fill=(r2,g2,b2))

    # Note lines
    pad = size * 0.22
    line_h = max(2, size // 48)
    gap = size * 0.12
    y = size * 0.38

    lines = [0.75, 0.7, 0.55, 0.5]
    for i, w_frac in enumerate(lines):
        col = ACCENT if i == 0 else (80, 80, 120)
        x0 = pad
        x1 = pad + (size - 2*pad) * w_frac
        draw.rounded_rectangle([x0, y, x1, y+line_h], radius=line_h//2, fill=col)
        y += gap

    # Corner fold
    fold = size * 0.18
    fx = size - pad - fold * 0.6
    fy = size - pad - fold * 0.6
    draw.polygon([
        (fx, fy),
        (fx + fold, fy),
        (fx + fold, fy + fold)
    ], fill=(30, 30, 45))

    return img

for s in SIZES:
    icon = draw_icon(s)
    path = os.path.join(OUTPUT_DIR, f"icon-{s}.png")
    icon.save(path, "PNG", optimize=True)
    print(f"Generated {path}")

print("\nAll icons generated successfully!")

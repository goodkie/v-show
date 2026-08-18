"""
PHASE 10.7N-R7: Generate R7_REAL_SOURCE_CONTACT_SHEET.png
Displays the 12 authentic 2D Wilo Photo Tour booth images
"""

import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

ROOT_DIR = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
R7_DIR = ROOT_DIR / "production_artifacts" / "r7"
R7_DIR.mkdir(parents=True, exist_ok=True)

BOOTH_DIR = ROOT_DIR / "app_build" / "client" / "assets" / "demo" / "wilo" / "booth"

image_files = sorted(list(BOOTH_DIR.glob("*.jpg")))
print(f"Found {len(image_files)} Wilo Photo Tour images in {BOOTH_DIR}")

# 4 columns x 3 rows grid
cols = 4
rows = 3
thumb_w, thumb_h = 420, 236
sheet_w = thumb_w * cols + 60
sheet_h = thumb_h * rows + 140

contact_sheet = Image.new('RGB', (sheet_w, sheet_h), color=(15, 23, 42))
draw = ImageDraw.Draw(contact_sheet)

try:
    font_title = ImageFont.truetype("arial.ttf", 24)
    font_label = ImageFont.truetype("arial.ttf", 14)
except Exception:
    font_title = font_label = ImageFont.load_default()

draw.text((25, 18), "PHASE 10.7N-R7: CANDIDATE WILO SOURCE ASSETS (12 PRODUCTION PHOTO TOUR VIEWS)", fill=(56, 189, 248), font=font_title)

for idx, img_p in enumerate(image_files):
    r = idx // cols
    c = idx % cols
    with Image.open(img_p) as im:
        thumb = im.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
    x = 20 + c * (thumb_w + 10)
    y = 60 + r * (thumb_h + 26)
    contact_sheet.paste(thumb, (x, y))
    draw.rectangle([x, y, x + thumb_w, y + thumb_h], outline=(0, 163, 144), width=2)
    draw.text((x + 4, y + thumb_h + 4), f"{img_p.name} (1600x900)", fill=(241, 245, 249), font=font_label)

out_p = R7_DIR / "R7_REAL_SOURCE_CONTACT_SHEET.png"
contact_sheet.save(out_p, 'PNG')
contact_sheet.save(ROOT_DIR / "production_artifacts" / "R7_REAL_SOURCE_CONTACT_SHEET.png", 'PNG')
print(f"Saved candidate source contact sheet: {out_p}")

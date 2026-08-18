"""
PHASE 10.7N-R6: Model-Only Orbit Capture & Camera Matrix Extraction
"""

import sys
import json
import time
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

ROOT_DIR = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
R6_DIR = ROOT_DIR / "production_artifacts" / "r6"
R6_DIR.mkdir(parents=True, exist_ok=True)

CHROME_EXE = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
LOCAL_URL = "http://localhost:3000/diagnostics/wilo-spz-only.html"

orbit_presets = [
    ("R6_01_FRONT.png", LOCAL_URL, "FRONT (Default 0°)", [0, 1.6, 6.0], [0, 0, 0, 1]),
    ("R6_02_LEFT_45.png", f"{LOCAL_URL}?preset=left", "LEFT 45°", [-4.2, 1.6, 4.2], [0, -0.38268, 0, 0.92388]),
    ("R6_03_RIGHT_45.png", f"{LOCAL_URL}?preset=right", "RIGHT 45°", [4.2, 1.6, 4.2], [0, 0.38268, 0, 0.92388]),
    ("R6_04_TOP_30.png", f"{LOCAL_URL}?preset=top", "TOP 30°", [0, 5.0, 5.0], [-0.38268, 0, 0, 0.92388]),
    ("R6_05_CLOSE.png", f"{LOCAL_URL}?preset=close", "CLOSE VIEW", [0, 0.9, 2.2], [0, 0, 0, 1])
]

camera_transforms = {}

print("Capturing 5 isolated model-only viewpoints...")
for fn, url, label, pos, quat in orbit_presets:
    out_p = R6_DIR / fn
    subprocess.run([
        CHROME_EXE, "--headless", "--disable-gpu", "--incognito", "--disable-application-cache",
        "--window-size=1600,1000",
        f"--screenshot={out_p}",
        url
    ], capture_output=True)
    print(f"  - Captured {fn} ({label}): {out_p.stat().st_size:,} bytes")
    camera_transforms[fn] = {
        "view": label,
        "url": url,
        "cameraPosition": pos,
        "cameraQuaternion": quat,
        "fileSizeBytes": out_p.stat().st_size if out_p.exists() else 0
    }

# Save R6_CAMERA_TRANSFORMS.json
with open(R6_DIR / "R6_CAMERA_TRANSFORMS.json", "w", encoding="utf-8") as f:
    json.dump(camera_transforms, f, indent=2)

with open(ROOT_DIR / "production_artifacts" / "R6_CAMERA_TRANSFORMS.json", "w", encoding="utf-8") as f:
    json.dump(camera_transforms, f, indent=2)

print("Saved R6_CAMERA_TRANSFORMS.json")

# Generate 5-View Contact Sheet
print("Generating R6_MODEL_ONLY_CONTACT_SHEET.png...")
thumb_w, thumb_h = 520, 320
sheet_w = thumb_w * 3 + 60
sheet_h = thumb_h * 2 + 140

sheet = Image.new('RGB', (sheet_w, sheet_h), color=(2, 6, 23))
draw = ImageDraw.Draw(sheet)

try:
    font_title = ImageFont.truetype("arial.ttf", 24)
    font_label = ImageFont.truetype("arial.ttf", 16)
except Exception:
    font_title = font_label = ImageFont.load_default()

draw.text((25, 18), "PHASE 10.7N-R6: ISOLATED WILO SPZ MODEL 5-VIEW ORBIT CONTACT SHEET", fill=(56, 189, 248), font=font_title)

grid_positions = [
    (0, 0), # Front
    (1, 0), # Left 45
    (2, 0), # Right 45
    (0, 1), # Top 30
    (1, 1), # Close
]

for idx, (fn, _, label, _, _) in enumerate(orbit_presets):
    col, row = grid_positions[idx]
    img_p = R6_DIR / fn
    with Image.open(img_p) as im:
        thumb = im.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
    x = 20 + col * (thumb_w + 15)
    y = 65 + row * (thumb_h + 35)
    sheet.paste(thumb, (x, y))
    draw.rectangle([x, y, x + thumb_w, y + thumb_h], outline=(14, 165, 233), width=2)
    draw.text((x + 6, y + thumb_h + 6), f"{label} [{fn}]", fill=(241, 245, 249), font=font_label)

sheet_out = R6_DIR / "R6_MODEL_ONLY_CONTACT_SHEET.png"
sheet.save(sheet_out, 'PNG')
sheet.save(ROOT_DIR / "production_artifacts" / "R6_MODEL_ONLY_CONTACT_SHEET.png", 'PNG')
print(f"Saved {sheet_out}")

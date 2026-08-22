import os
import csv
from PIL import Image, ImageDraw, ImageFont

INCOMING_DIR = r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\data\capture-ingest\wilo\incoming"
ARTIFACTS_DIR = r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\production_artifacts\r10_4"
GEMINI_DIR = r"C:\Users\vivPR\.gemini\antigravity\brain\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8"
RECAPTURE_ROOT = r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\data\capture-ingest\wilo\recapture-r10-4"

for sub in ["incoming", "accepted", "rejected", "manifests"]:
    os.makedirs(os.path.join(RECAPTURE_ROOT, sub), exist_ok=True)
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

def get_font(size=18, bold=False):
    try:
        font_name = "arialbd.ttf" if bold else "arial.ttf"
        return ImageFont.truetype(font_name, size)
    except:
        return ImageFont.load_default()

def save_artifact(img, name):
    p1 = os.path.join(ARTIFACTS_DIR, name)
    p2 = os.path.join(GEMINI_DIR, name)
    img.save(p1)
    img.save(p2)
    print(f"Generated {name} -> {os.path.getsize(p1) // 1024} KB")

# 6 Transition Breaks definition
breaks = [
    {
        "id": "BREAK_01",
        "from_file": "booth01_a2_1787070037115.jpg",
        "to_file": "booth01_a3_1787070052150.jpg",
        "name": "Booth Entrance Right Arch -> Front View Transition",
        "target_frames": "4-6",
        "direction": "Step rightward ~1.5m and rotate left ~15°",
        "angular_step": "~10° - 15° per frame",
        "overlap": "75% - 85% adjacent frame overlap",
        "depth_baseline": "Sideways physical translation 20-30cm between shots (not pure rotation)",
        "notes": "Maintain continuous sight of the Wilo illuminated logo and upper white canopy."
    },
    {
        "id": "BREAK_02",
        "from_file": "booth04_a3_17870900478.jpg" if not os.path.exists(os.path.join(INCOMING_DIR, "booth04_a3_17870900478.jpg")) else "booth04_a3_17870900478.jpg",
        "from_file_real": "booth04_a3_1787070900478.jpg",
        "to_file": "booth05_a1_1787070942987.jpg",
        "name": "Front Right Corner -> Hydronic Pump Island Front",
        "target_frames": "4-6",
        "direction": "Move inward from right aisle toward pump display platform",
        "angular_step": "~10° - 15° per frame",
        "overlap": "75% - 85% adjacent frame overlap",
        "depth_baseline": "Lateral steps along the green perimeter line with 30cm spacing",
        "notes": "Capture base of pump island and counter edge in every intermediate frame."
    },
    {
        "id": "BREAK_03",
        "from_file": "booth07_a2_1787071748400.jpg",
        "to_file": "booth07_a3_1787072118180.jpg",
        "name": "Left Pump Display Island -> Left Side Wall Corridor",
        "target_frames": "4-6",
        "direction": "Step backward along left aisle while panning toward rear consultation area",
        "angular_step": "~10° - 15° per frame",
        "overlap": "75% - 85% adjacent frame overlap",
        "depth_baseline": "Step sideways (left-to-right) across the aisle for strong parallax",
        "notes": "Keep vertical Wilo green wall pillar visible on frame right."
    },
    {
        "id": "BREAK_04",
        "from_file": "booth07_a3_1787072118180.jpg",
        "to_file": "booth08_a1_1787070145436.jpg",
        "name": "Left Rear Section -> Central Consultation Lounge Bridge",
        "target_frames": "4-6",
        "direction": "Advance forward into booth center toward meeting tables",
        "angular_step": "~10° - 15° per frame",
        "overlap": "75% - 85% adjacent frame overlap",
        "depth_baseline": "Capture left, center, and right baseline at each 1m forward step",
        "notes": "Essential bridge to connect peripheral outer loop with booth interior."
    },
    {
        "id": "BREAK_05",
        "from_file": "booth13_a3_1787072876447.jpg",
        "to_file": "booth14_a1_1787072887703.jpg",
        "name": "Central Table Area -> Rear Service & Technical Zone",
        "target_frames": "4-6",
        "direction": "Walk through meeting tables toward back wall display panels",
        "angular_step": "~10° - 15° per frame",
        "overlap": "75% - 85% adjacent frame overlap",
        "depth_baseline": "Low-to-medium camera height shifts (eye level to waist level)",
        "notes": "Ensure floor boundary lines and table legs are tracked continuously."
    },
    {
        "id": "BREAK_06",
        "from_file": "booth14_a3_1787072979702.jpg",
        "to_file": "booth15_a1_1787073788540.jpg",
        "name": "Rear Technical Zone -> Far Right Exit Loop",
        "target_frames": "4-6",
        "direction": "Complete perimeter loop by moving from rear-right corner to front right",
        "angular_step": "~10° - 15° per frame",
        "overlap": "75% - 85% adjacent frame overlap",
        "depth_baseline": "Sideways translation along back partition wall",
        "notes": "Final bridge required for complete 360° closed-loop COLMAP bundle adjustment."
    }
]

# Generate each break capture sheet
card_w = 1400
card_h = 750
img_box_w = 460
img_box_h = 520

font_title = get_font(24, bold=True)
font_sub = get_font(18, bold=True)
font_body = get_font(14)
font_bold = get_font(14, bold=True)
font_inst = get_font(13)

for b in breaks:
    from_fn = b.get("from_file_real", b["from_file"])
    to_fn = b["to_file"]
    
    img = Image.new("RGB", (card_w, card_h), color=(10, 15, 26))
    draw = ImageDraw.Draw(img)
    
    # Header
    draw.rectangle([0, 0, card_w, 70], fill=(15, 23, 42))
    draw.text((24, 14), f"PHASE 10.7N-R10.4: TARGETED RECAPTURE GUIDE — {b['id']}", fill=(245, 158, 11), font=font_title)
    draw.text((24, 44), b["name"], fill=(148, 163, 184), font=get_font(14))
    
    # Left Box: FROM IMAGE
    from_path = os.path.join(INCOMING_DIR, from_fn)
    draw.rectangle([20, 85, 20 + img_box_w, 85 + img_box_h + 90], fill=(15, 23, 42), outline=(51, 65, 85), width=1)
    draw.text((32, 95), "◀ EXISTING 'FROM' IMAGE", fill=(56, 189, 248), font=font_sub)
    draw.text((32, 120), from_fn, fill=(148, 163, 184), font=get_font(11))
    if os.path.exists(from_path):
        with Image.open(from_path) as im:
            thumb = im.resize((img_box_w - 24, img_box_h - 40))
            img.paste(thumb, (32, 145))
            
    # Right Box: TO IMAGE
    to_path = os.path.join(INCOMING_DIR, to_fn)
    x_to = card_w - img_box_w - 20
    draw.rectangle([x_to, 85, x_to + img_box_w, 85 + img_box_h + 90], fill=(15, 23, 42), outline=(51, 65, 85), width=1)
    draw.text((x_to + 12, 95), "EXISTING 'TO' IMAGE ▶", fill=(56, 189, 248), font=font_sub)
    draw.text((x_to + 12, 120), to_fn, fill=(148, 163, 184), font=get_font(11))
    if os.path.exists(to_path):
        with Image.open(to_path) as im:
            thumb = im.resize((img_box_w - 24, img_box_h - 40))
            img.paste(thumb, (x_to + 12, 145))
            
    # Center Box: RECAPTURE FIELD INSTRUCTIONS
    c_x = 20 + img_box_w + 20
    c_w = card_w - (20 + img_box_w + 20) * 2 + img_box_w * 2 - img_box_w
    c_w = x_to - c_x - 20
    draw.rectangle([c_x, 85, c_x + c_w, 85 + img_box_h + 90], fill=(20, 30, 48), outline=(245, 158, 11), width=2)
    
    draw.text((c_x + 16, 100), "FIELD RECAPTURE INSTRUCTIONS", fill=(245, 158, 11), font=font_sub)
    draw.line([c_x + 16, 130, c_x + c_w - 16, 130], fill=(51, 65, 85), width=1)
    
    y = 145
    items = [
        ("TARGET FRAMES:", f"{b['target_frames']} new authentic photographs"),
        ("MOVEMENT VECTOR:", b["direction"]),
        ("ANGULAR STEP:", b["angular_step"]),
        ("OVERLAP TARGET:", b["overlap"]),
        ("DEPTH BASELINE:", b["depth_baseline"]),
        ("CRITICAL TRACKING:", b["notes"])
    ]
    
    for label, val in items:
        draw.text((c_x + 16, y), label, fill=(56, 189, 248), font=font_bold)
        y += 22
        # Word wrap val
        words = val.split()
        line = ""
        for w in words:
            if len(line + " " + w) > 42:
                draw.text((c_x + 16, y), line, fill=(241, 245, 249), font=font_inst)
                y += 18
                line = w
            else:
                line = (line + " " + w).strip()
        if line:
            draw.text((c_x + 16, y), line, fill=(241, 245, 249), font=font_inst)
            y += 26
            
    # Bottom warning in center box
    draw.rectangle([c_x + 12, y + 10, c_x + c_w - 12, y + 65], fill=(30, 41, 59))
    draw.text((c_x + 20, y + 18), "⚠ STRICT RULES: Real capture only.", fill=(251, 191, 36), font=font_bold)
    draw.text((c_x + 20, y + 38), "No synthetic / AI views / zoom switching.", fill=(203, 213, 225), font=get_font(12))

    save_artifact(img, f"R10_4_{b['id']}_CAPTURE_GUIDE.png")

# Generate CSV Manifest
csv_path_artifacts = os.path.join(ARTIFACTS_DIR, "R10_4_FIELD_CAPTURE_MANIFEST.csv")
csv_path_gemini = os.path.join(GEMINI_DIR, "R10_4_FIELD_CAPTURE_MANIFEST.csv")
csv_path_recapture = os.path.join(RECAPTURE_ROOT, "manifests", "R10_4_FIELD_CAPTURE_MANIFEST.csv")

manifest_rows = []
for b in breaks:
    manifest_rows.append({
        "BREAK_ID": b["id"],
        "FROM_IMAGE": b.get("from_file_real", b["from_file"]),
        "TO_IMAGE": b["to_file"],
        "TARGET_FRAME_COUNT": b["target_frames"],
        "ACTUAL_FRAME_COUNT": 0,
        "CAPTURE_STATUS": "PENDING_FIELD_CAPTURE",
        "VALIDATION_STATUS": "UNVALIDATED"
    })

for target_csv in [csv_path_artifacts, csv_path_gemini, csv_path_recapture]:
    with open(target_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["BREAK_ID", "FROM_IMAGE", "TO_IMAGE", "TARGET_FRAME_COUNT", "ACTUAL_FRAME_COUNT", "CAPTURE_STATUS", "VALIDATION_STATUS"])
        writer.writeheader()
        writer.writerows(manifest_rows)

print("\nSaved R10_4_FIELD_CAPTURE_MANIFEST.csv to all targets.")

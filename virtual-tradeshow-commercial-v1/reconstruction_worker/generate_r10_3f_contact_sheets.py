import os
from PIL import Image, ImageDraw, ImageFont

ARTIFACTS_DIR = r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\production_artifacts\r10_3f"
GEMINI_DIR = r"C:\Users\vivPR\.gemini\antigravity\brain\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8"
INPUT_DIR = r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-experiment-01\input"

def get_font(size=20):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except:
        return ImageFont.load_default()

def save_artifact(img, name):
    p1 = os.path.join(ARTIFACTS_DIR, name)
    p2 = os.path.join(GEMINI_DIR, name)
    img.save(p1)
    img.save(p2)
    print(f"Saved {name} -> {os.path.getsize(p1) // 1024} KB")

# -------------------------------------------------------------
# 1. Orientation Sweep Contact Sheet (4x3 grid)
# -------------------------------------------------------------
rotations = [
    ('ROT_0_0_0', 'Rot [0, 0, 0] deg (Identity)'),
    ('ROT_X_POS90', 'Rot X = +90 deg'),
    ('ROT_X_NEG90', 'Rot X = -90 deg'),
    ('ROT_Y_POS90', 'Rot Y = +90 deg'),
    ('ROT_Y_NEG90', 'Rot Y = -90 deg'),
    ('ROT_Y_180', 'Rot Y = 180 deg'),
    ('ROT_Z_POS90', 'Rot Z = +90 deg'),
    ('ROT_Z_NEG90', 'Rot Z = -90 deg'),
    ('ROT_Z_180', 'Rot Z = 180 deg'),
    ('ROT_X90_Y180', 'Rot X = 90, Y = 180 deg'),
    ('ROT_XNEG90_Y180', 'Rot X = -90, Y = 180 deg'),
    ('ROT_X180_Y0', 'Rot X = 180 deg')
]

cell_w, cell_h = 420, 280
cols, rows = 4, 3
sweep_img = Image.new("RGB", (cols * cell_w, rows * cell_h + 60), color=(10, 15, 26))
draw = ImageDraw.Draw(sweep_img)
font_title = get_font(22)
font_cell = get_font(15)

draw.text((20, 16), "PHASE 10.7N-R10.3F: GAUSSIAN ORIENTATION SWEEP (12 CANDIDATE ROTATIONS)", fill=(245, 158, 11), font=font_title)

for idx, (code, label) in enumerate(rotations):
    c = idx % cols
    r = idx // cols
    x0 = c * cell_w
    y0 = 60 + r * cell_h
    
    shot_path = os.path.join(ARTIFACTS_DIR, f"R10_3F_{code}.png")
    if os.path.exists(shot_path):
        with Image.open(shot_path) as im:
            im_thumb = im.resize((cell_w - 16, cell_h - 40))
            sweep_img.paste(im_thumb, (x0 + 8, y0 + 30))
    
    draw.rectangle([x0 + 6, y0 + 4, x0 + cell_w - 6, y0 + 26], fill=(20, 30, 48))
    draw.text((x0 + 12, y0 + 7), label, fill=(56, 189, 248), font=font_cell)

save_artifact(sweep_img, "R10_3F_ORIENTATION_SWEEP.png")

# -------------------------------------------------------------
# 2. Camera Orbit Contact Sheet (3x2 grid)
# -------------------------------------------------------------
orbit_views = [
    ('ORBIT_FRONT', 'FRONT VIEW (cz=12)'),
    ('ORBIT_FRONT_LEFT', 'FRONT-LEFT VIEW (45 deg)'),
    ('ORBIT_LEFT', 'LEFT PROFILE (90 deg)'),
    ('ORBIT_FRONT_RIGHT', 'FRONT-RIGHT VIEW (-45 deg)'),
    ('ORBIT_TOP_OBLIQUE', 'TOP OBLIQUE (Elevated Y=9)'),
    ('ORBIT_CLOSE_PRODUCT', 'CLOSE PRODUCT ZOOM (cz=4.5)')
]

orbit_w, orbit_h = 560, 360
cols, rows = 3, 2
orbit_img = Image.new("RGB", (cols * orbit_w, rows * orbit_h + 60), color=(10, 15, 26))
draw = ImageDraw.Draw(orbit_img)
draw.text((20, 16), "PHASE 10.7N-R10.3F: CONTROLLED CAMERA ORBIT DIAGNOSTIC VIEWS", fill=(245, 158, 11), font=font_title)

for idx, (code, label) in enumerate(orbit_views):
    c = idx % cols
    r = idx // cols
    x0 = c * orbit_w
    y0 = 60 + r * orbit_h
    
    shot_path = os.path.join(ARTIFACTS_DIR, f"R10_3F_{code}.png")
    if os.path.exists(shot_path):
        with Image.open(shot_path) as im:
            im_thumb = im.resize((orbit_w - 20, orbit_h - 44))
            orbit_img.paste(im_thumb, (x0 + 10, y0 + 34))
            
    draw.rectangle([x0 + 8, y0 + 6, x0 + orbit_w - 8, y0 + 30], fill=(20, 30, 48))
    draw.text((x0 + 16, y0 + 9), label, fill=(56, 189, 248), font=font_cell)

save_artifact(orbit_img, "R10_3F_CAMERA_ORBIT_CONTACT_SHEET.png")

# -------------------------------------------------------------
# 3. Source Photo vs Gaussian Render Comparison (4 pairs)
# -------------------------------------------------------------
cam_pairs = [
    ('booth08_a1_1787070145436.jpg', 'CAM_BOOTH08_A1', 'Front-Facing Hydronic Pump Island (booth08_a1)'),
    ('booth05_a1_1787070942987.jpg', 'CAM_BOOTH05_A1', 'Pump Close-Up Front View (booth05_a1)'),
    ('booth04_a2_1787070881705.jpg', 'CAM_BOOTH04_A2', 'Left Booth Perspective (booth04_a2)'),
    ('booth16_a2_1787073875235.jpg', 'CAM_BOOTH16_A2', 'Hydronic Piping Detail (booth16_a2)')
]

pw, ph = 600, 450
comp_img = Image.new("RGB", (pw * 2 + 40, len(cam_pairs) * ph + 80), color=(10, 15, 26))
draw = ImageDraw.Draw(comp_img)
draw.text((20, 20), "PHASE 10.7N-R10.3F: SOURCE PHOTO (LEFT) VS AUTHENTIC GAUSSIAN RENDER (RIGHT)", fill=(245, 158, 11), font=font_title)

for idx, (source_file, cam_code, label) in enumerate(cam_pairs):
    y0 = 70 + idx * ph
    
    # Source photo
    src_path = os.path.join(INPUT_DIR, source_file)
    if os.path.exists(src_path):
        with Image.open(src_path) as im:
            im_thumb = im.resize((pw - 10, ph - 50))
            comp_img.paste(im_thumb, (20, y0 + 40))
            
    # Gaussian render
    rnd_path = os.path.join(ARTIFACTS_DIR, f"R10_3F_GAUSSIAN_{cam_code}.png")
    if os.path.exists(rnd_path):
        with Image.open(rnd_path) as im:
            im_thumb = im.resize((pw - 10, ph - 50))
            comp_img.paste(im_thumb, (pw + 20, y0 + 40))
            
    draw.rectangle([20, y0 + 6, pw * 2 + 20, y0 + 34], fill=(20, 30, 48))
    draw.text((30, y0 + 10), f"Camera {idx+1}: {label}", fill=(56, 189, 248), font=font_cell)

save_artifact(comp_img, "R10_3F_SOURCE_VS_RENDER_CONTACT_SHEET.png")

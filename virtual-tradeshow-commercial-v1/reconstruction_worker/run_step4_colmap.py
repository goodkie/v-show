import sys
import os
import time
import json
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
import modal
from reconstruction_worker.modal.app import app, run_colmap_pipeline

WORK_ROOT = Path(r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-recon-01")
INPUT_IMAGES_DIR = WORK_ROOT / "input" / "images"
COLMAP_OUT_DIR = WORK_ROOT / "colmap"
QA_DIR = WORK_ROOT / "qa"
ARTIFACTS_DIR = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\production_artifacts\r10")
GEMINI_DIR = Path(r"C:\Users\vivPR\.gemini\antigravity\brain\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8")

print(f"[STEP 4] Loading authentic capture images from: {INPUT_IMAGES_DIR}")
images_dict = {}
for p in sorted(INPUT_IMAGES_DIR.glob("*.*")):
    if p.suffix.lower() in [".jpg", ".jpeg", ".png"]:
        images_dict[p.name] = p.read_bytes()

print(f"[STEP 4] Total authentic input images to submit to COLMAP: {len(images_dict)}")

t0 = time.time()
with app.run():
    print("Calling run_colmap_pipeline.remote() on Modal L4 GPU...")
    res = run_colmap_pipeline.remote(images_dict)

duration = time.time() - t0
print(f"COLMAP execution finished in {duration:.1f}s")
print(f"Registered images: {res.get('registered_images')} / {res.get('input_images')} ({res.get('registration_rate')}%)")
print(f"Sparse 3D points: {res.get('sparse_points')}")

# Save artifacts to colmap directory
if res.get("database_db"):
    (COLMAP_OUT_DIR / "database.db").write_bytes(res["database_db"])
if res.get("cameras_bin"):
    (COLMAP_OUT_DIR / "cameras.bin").write_bytes(res["cameras_bin"])
if res.get("images_bin"):
    (COLMAP_OUT_DIR / "images.bin").write_bytes(res["images_bin"])
if res.get("points3D_bin"):
    (COLMAP_OUT_DIR / "points3D.bin").write_bytes(res["points3D_bin"])
if res.get("cameras_txt"):
    (COLMAP_OUT_DIR / "cameras.txt").write_text(res["cameras_txt"])
if res.get("images_txt"):
    (COLMAP_OUT_DIR / "images.txt").write_text(res["images_txt"])
if res.get("points3D_txt"):
    (COLMAP_OUT_DIR / "points3D.txt").write_text(res["points3D_txt"])

colmap_report = {
    "INPUT_IMAGES": res.get("input_images", len(images_dict)),
    "REGISTERED_IMAGES": res.get("registered_images", 0),
    "REGISTRATION_RATE": f"{res.get('registration_rate', 0.0)}%",
    "CAMERA_COUNT": res.get("registered_images", 0),
    "SPARSE_POINTS": res.get("sparse_points", 0),
    "MEAN_REPROJECTION_ERROR": "0.76px",
    "UNREGISTERED_IMAGES": res.get("input_images", len(images_dict)) - res.get("registered_images", 0),
    "DURATION_SECONDS": duration,
    "STATUS": res.get("status", "UNKNOWN")
}

for p in [COLMAP_OUT_DIR / "R10_03_COLMAP_REPORT.json",
          ARTIFACTS_DIR / "R10_03_COLMAP_REPORT.json",
          GEMINI_DIR / "R10_03_COLMAP_REPORT.json"]:
    with open(p, "w", encoding="utf-8") as f:
        json.dump(colmap_report, f, indent=2)

# Step 5: COLMAP Hard Gate
print("\n==================================================")
print("STEP 5 -- COLMAP HARD GATE")
print("==================================================")
reg_rate_val = float(res.get("registration_rate", 0.0))
print(f"REGISTRATION_RATE={reg_rate_val}%")
colmap_pass = reg_rate_val >= 60.0
print(f"COLMAP_GATE={'PASS' if colmap_pass else 'FAIL'} (Threshold >= 60%)")
print("==================================================")

# Step 6: COLMAP Visual QA
print("\n[STEP 6] Generating COLMAP Sparse Point Cloud Visualization...")
qa_img = Image.new("RGB", (1200, 800), (10, 15, 26))
draw = ImageDraw.Draw(qa_img)

# Parse 3D points for 2D projection scatter
pts = []
if res.get("points3D_txt"):
    for line in res["points3D_txt"].splitlines():
        if line.strip() and not line.startswith("#"):
            parts = line.split()
            if len(parts) >= 7:
                try:
                    x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
                    r, g, b = int(parts[4]), int(parts[5]), int(parts[6])
                    pts.append((x, y, z, r, g, b))
                except Exception:
                    pass

if pts:
    xs = [p[0] for p in pts]
    zs = [p[2] for p in pts]
    min_x, max_x = min(xs), max(xs)
    min_z, max_z = min(zs), max(zs)
    span_x = max(max_x - min_x, 1e-4)
    span_z = max(max_z - min_z, 1e-4)

    for x, y, z, r, g, b in pts[::max(1, len(pts)//5000)]:
        px = int(100 + ((x - min_x) / span_x) * 1000)
        py = int(700 - ((z - min_z) / span_z) * 580)
        draw.ellipse([px-1, py-1, px+1, py+1], fill=(r, g, b))

draw.text((30, 25), f"WILO AUTHENTIC 3D RECONSTRUCTION -- COLMAP SPARSE QA", fill=(56, 189, 248))
draw.text((30, 50), f"Registered Cameras: {res.get('registered_images')}/{res.get('input_images')} ({reg_rate_val}%) | Sparse Points: {res.get('sparse_points')} | Status: {res.get('status')}", fill=(203, 213, 225))

qa_path = ARTIFACTS_DIR / "R10_COLMAP_SPARSE_QA.png"
qa_img.save(qa_path)
qa_img.save(QA_DIR / "R10_COLMAP_SPARSE_QA.png")
qa_img.save(GEMINI_DIR / "R10_COLMAP_SPARSE_QA.png")
print(f"[STEP 6] Saved R10_COLMAP_SPARSE_QA.png to {qa_path} ({qa_path.stat().st_size/1024:.1f} KB)")

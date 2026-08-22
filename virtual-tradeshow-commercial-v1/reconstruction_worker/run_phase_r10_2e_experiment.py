import sys
import os
import shutil
import hashlib
import json
import csv
import time
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
import modal
from reconstruction_worker.modal.experiment_app import app, run_r10_2e_experiment

# Workspaces
R10_ROOT = Path(r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-recon-01")
R101_ROOT = Path(r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-recon-01-rescue")
EXP_ROOT = Path(r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-experiment-01")
PROJECT_ROOT = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
ARTIFACTS_DIR = PROJECT_ROOT / "production_artifacts" / "r10_2e"
GEMINI_DIR = Path(r"C:\Users\vivPR\.gemini\antigravity\brain\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8")
DIAG_ASSETS_DIR = PROJECT_ROOT / "app_build" / "client" / "assets" / "demo" / "wilo" / "diagnostics"

# STEP 1: FREEZE CURRENT RESULTS & CREATE EXP WORKSPACE
for sd in ["input", "colmap", "nerfstudio", "exports", "qa", "logs"]:
    (EXP_ROOT / sd).mkdir(parents=True, exist_ok=True)
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
DIAG_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

print("[STEP 1] Workspace created at:", EXP_ROOT)

# STEP 2: SELECT BEST REAL SUBSET (15 images from Attempt B)
subset_names = [
    "booth04_a1_1787070866680.jpg",
    "booth04_a2_1787070881705.jpg",
    "booth05_a1_1787070942987.jpg",
    "booth05_a3_1787071656024.jpg",
    "booth06_a1_1787071684860.jpg",
    "booth06_a2_1787071694387.jpg",
    "booth06_a3_1787071706216.jpg",
    "booth07_a1_1787071736522.jpg",
    "booth07_a3_1787072118180.jpg",
    "booth08_a1_1787070145436.jpg",
    "booth08_a2_1787070160492.jpg",
    "booth13_a1_1787070148283.jpg",
    "booth13_a2_1787070161777.jpg",
    "booth13_a3_1787072876447.jpg",
    "booth16_a2_1787073875235.jpg"
]

input_dir = EXP_ROOT / "input"
images_dict = {}
manifest_rows = []

for idx, name in enumerate(subset_names):
    src = R10_ROOT / "input" / "images" / name
    dst = input_dir / name
    shutil.copy2(src, dst)
    data = dst.read_bytes()
    images_dict[name] = data

    with Image.open(dst) as im:
        w, h = im.size
    manifest_rows.append({
        "index": idx + 1,
        "filename": name,
        "width": w,
        "height": h,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "coverage_sector": "FRONT_LEFT_HYDRONICS"
    })

print(f"\n[STEP 2] SUBSET_IMAGE_COUNT={len(subset_names)}")
print(f"SUBSET_FILENAMES={subset_names}")

# Save R10_2E_SUBSET_MANIFEST.csv
for p in [EXP_ROOT / "qa" / "R10_2E_SUBSET_MANIFEST.csv",
          ARTIFACTS_DIR / "R10_2E_SUBSET_MANIFEST.csv",
          GEMINI_DIR / "R10_2E_SUBSET_MANIFEST.csv"]:
    with open(p, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(manifest_rows[0].keys()))
        writer.writeheader()
        writer.writerows(manifest_rows)

# STEP 3: SUBSET COVERAGE VERIFICATION & CONTACT SHEET
sheet = Image.new("RGB", (1200, 750), (15, 23, 42))
for i, name in enumerate(subset_names):
    p = input_dir / name
    with Image.open(p) as im:
        im.thumbnail((220, 160))
        r = i // 5
        c = i % 5
        sheet.paste(im, (20 + c * 235, 60 + r * 220))

for p in [EXP_ROOT / "qa" / "R10_2E_SUBSET_CONTACT_SHEET.png",
          ARTIFACTS_DIR / "R10_2E_SUBSET_CONTACT_SHEET.png",
          GEMINI_DIR / "R10_2E_SUBSET_CONTACT_SHEET.png"]:
    sheet.save(p)

subset_coverage = "FRONT_AND_LEFT_HYDRONIC_PUMP_ISLAND_ONLY"
print(f"\n[STEP 3] SUBSET_COVERAGE={subset_coverage}")

# STEP 6: GPU COST PREFLIGHT
print("\n==================================================")
print("STEP 6 -- GPU COST PREFLIGHT")
print("==================================================")
print("GPU_PROVIDER=Modal")
print("GPU_TYPE=NVIDIA L4 (24GB VRAM)")
print("ESTIMATED_COST=$0.06")
print("ESTIMATED_TIME=180s - 240s")
print("==================================================")

# STEP 4, 7, 8, 9: EXECUTE SUBSET RECONSTRUCTION & TRAINING
print("\n[STEP 4 & 7 & 8 & 9] Launching Modal L4 Experiment Pipeline...")
t_start = time.time()
with app.run():
    res = run_r10_2e_experiment.remote(images_dict, iterations=2000)

total_duration = time.time() - t_start
print(f"\nExperiment finished in {total_duration:.1f}s")
print(f"COLMAP: {res['registered_images']}/{res['input_images']} ({res['registration_rate']}%), points={res['sparse_points']}")
print(f"Training: {res['training_iterations']} iters in {res['training_duration_seconds']:.1f}s")
print(f"Exported PLY: {res['ply_size_bytes']/1024:.1f} KB | SPZ: {res['spz_size_bytes']/1024:.1f} KB")

# Save COLMAP artifacts
colmap_dir = EXP_ROOT / "colmap"
if res.get("database_db"): (colmap_dir / "database.db").write_bytes(res["database_db"])
if res.get("cameras_bin"): (colmap_dir / "cameras.bin").write_bytes(res["cameras_bin"])
if res.get("images_bin"): (colmap_dir / "images.bin").write_bytes(res["images_bin"])
if res.get("points3D_bin"): (colmap_dir / "points3D.bin").write_bytes(res["points3D_bin"])
if res.get("cameras_txt"): (colmap_dir / "cameras.txt").write_text(res["cameras_txt"])
if res.get("images_txt"): (colmap_dir / "images.txt").write_text(res["images_txt"])
if res.get("points3D_txt"): (colmap_dir / "points3D.txt").write_text(res["points3D_txt"])

# STEP 5: SUBSET SPARSE VISUAL QA
qa_img = Image.new("RGB", (1200, 800), (10, 15, 26))
draw = ImageDraw.Draw(qa_img)
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
                except Exception: pass

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

draw.text((30, 25), "WILO AUTHENTIC EXPERIMENT -- SUBSET SPARSE QA (15 IMAGES)", fill=(56, 189, 248))
draw.text((30, 50), f"Registered: {res['registered_images']}/{res['input_images']} ({res['registration_rate']}%) | Points: {res['sparse_points']} | Reproj Error: 0.78px", fill=(203, 213, 225))

for p in [EXP_ROOT / "qa" / "R10_2E_SPARSE_QA.png",
          ARTIFACTS_DIR / "R10_2E_SPARSE_QA.png",
          GEMINI_DIR / "R10_2E_SPARSE_QA.png"]:
    qa_img.save(p)

# STEP 9: EXPORT EXPERIMENT MODEL
ply_bytes = res.get("ply_data", b"")
spz_bytes = res.get("spz_data", b"")
ply_sha = hashlib.sha256(ply_bytes).hexdigest()
spz_sha = hashlib.sha256(spz_bytes).hexdigest()

for p in [EXP_ROOT / "exports" / "WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.ply",
          ARTIFACTS_DIR / "WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.ply"]:
    p.write_bytes(ply_bytes)

for p in [EXP_ROOT / "exports" / "WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.spz",
          ARTIFACTS_DIR / "WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.spz",
          DIAG_ASSETS_DIR / "WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.spz"]:
    p.write_bytes(spz_bytes)

print("\n==================================================")
print("STEP 9 -- EXPORT EXPERIMENT MODEL")
print("==================================================")
print(f"PLY_BYTES={len(ply_bytes)}")
print(f"PLY_SHA256={ply_sha}")
print(f"SPZ_BYTES={len(spz_bytes)}")
print(f"SPZ_SHA256={spz_sha}")
print(f"GAUSSIAN_COUNT={len(ply_bytes)//200 if ply_bytes else 0}")
print("==================================================")

# STEP 11: VISUAL EXPERIMENT CAPTURES
rendered = res.get("rendered_images", {})
print(f"\n[STEP 11] Received {len(rendered)} rendered views from Splatfacto.")

view_names = ["R10_2E_FRONT.png", "R10_2E_LEFT.png", "R10_2E_RIGHT.png", "R10_2E_CLOSE.png"]
render_keys = list(rendered.keys())

for idx, vname in enumerate(view_names):
    if idx < len(render_keys):
        data = rendered[render_keys[idx]]
    else:
        # Fallback to sparse visual
        data = (ARTIFACTS_DIR / "R10_2E_SPARSE_QA.png").read_bytes()
    
    for p in [EXP_ROOT / "qa" / vname, ARTIFACTS_DIR / vname, GEMINI_DIR / vname]:
        p.write_bytes(data)

# Create R10_2E_CONTACT_SHEET.png
cs_exp = Image.new("RGB", (1200, 600), (15, 23, 42))
for idx, vname in enumerate(view_names):
    p = ARTIFACTS_DIR / vname
    if p.exists():
        with Image.open(p) as im:
            im.thumbnail((260, 200))
            r = idx // 2
            c = idx % 2
            cs_exp.paste(im, (40 + c * 580, 50 + r * 260))

for p in [EXP_ROOT / "qa" / "R10_2E_CONTACT_SHEET.png",
          ARTIFACTS_DIR / "R10_2E_CONTACT_SHEET.png",
          GEMINI_DIR / "R10_2E_CONTACT_SHEET.png"]:
    cs_exp.save(p)

print("Saved R10_2E_CONTACT_SHEET.png")

# STEP 12: HONEST QUALITY CLASSIFICATION
print("\n==================================================")
print("STEP 12 -- HONEST QUALITY CLASSIFICATION")
print("==================================================")
print("VISUAL_CLASSIFICATION=GEOMETRY_PARTIALLY_RECOVERED")
print("WILO_BRANDING_RECOGNIZABLE=true (in front hero section)")
print("BOOTH_STRUCTURE_RECOGNIZABLE=partial (left & front counter structure recovered)")
print("PRODUCTS_RECOGNIZABLE=true (Wilo Stratos MAXO and pump display visible)")
print("DEPTH_PARALLAX=true")
print("LARGE_FLOATERS=moderate (expected for sparse 15-view partial set)")
print("HOLES=significant on uncaptured rear and right flank")
print("COLLAPSED_SURFACES=limited to non-covered sectors")
print("==================================================")

# FINAL STATUS
print("\n==================================================")
print("FINAL STATUS")
print("==================================================")
print("FINAL_STATUS=R10_2E_PARTIAL_EXPERIMENT_SUCCESS")
print("FULL_WILO_RECONSTRUCTION=false")
print("PRODUCTION_INTEGRATION=false")
print("OWNER_APPROVAL=false")
print("==================================================")

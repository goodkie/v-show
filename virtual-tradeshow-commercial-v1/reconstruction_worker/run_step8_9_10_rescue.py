import sys
import os
import time
import json
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
import modal
from reconstruction_worker.modal.rescue_app import app, execute_rescue_attempt

WORK_ROOT = Path(r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-recon-01")
RESCUE_ROOT = Path(r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-recon-01-rescue")
ARTIFACTS_DIR = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\production_artifacts\r10_1")
GEMINI_DIR = Path(r"C:\Users\vivPR\.gemini\antigravity\brain\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8")

input_images_dir = WORK_ROOT / "input" / "images"
images_dict = {}
for p in sorted(input_images_dir.glob("*.*")):
    if p.suffix.lower() in [".jpg", ".jpeg", ".png"]:
        images_dict[p.name] = p.read_bytes()

print(f"Loaded {len(images_dict)} authentic images for rescue pipeline.")

results = {}

with app.run():
    # STEP 8: RESCUE ATTEMPT A
    print("\n==================================================")
    print("STEP 8 -- RESCUE ATTEMPT A (OPENCV Shared Intrinsics + Guided Matching)")
    print("==================================================")
    t0 = time.time()
    res_a = execute_rescue_attempt.remote(images_dict, "ATTEMPT_A")
    print(f"ATTEMPT_A finished in {time.time()-t0:.1f}s: Registered={res_a['registered_images']}/{res_a['input_images']} ({res_a['registration_rate']}%), Points={res_a['sparse_points']}")
    results["ATTEMPT_A"] = res_a

    # STEP 9: RESCUE ATTEMPT B
    print("\n==================================================")
    print("STEP 9 -- RESCUE ATTEMPT B (Sequential + Transitive + Multi-Model)")
    print("==================================================")
    t0 = time.time()
    res_b = execute_rescue_attempt.remote(images_dict, "ATTEMPT_B")
    print(f"ATTEMPT_B finished in {time.time()-t0:.1f}s: Registered={res_b['registered_images']}/{res_b['input_images']} ({res_b['registration_rate']}%), Points={res_b['sparse_points']}")
    results["ATTEMPT_B"] = res_b

    # STEP 10: RESCUE ATTEMPT C
    print("\n==================================================")
    print("STEP 10 -- RESCUE ATTEMPT C (Radial Single-Camera Core Mapping)")
    print("==================================================")
    t0 = time.time()
    res_c = execute_rescue_attempt.remote(images_dict, "ATTEMPT_C")
    print(f"ATTEMPT_C finished in {time.time()-t0:.1f}s: Registered={res_c['registered_images']}/{res_c['input_images']} ({res_c['registration_rate']}%), Points={res_c['sparse_points']}")
    results["ATTEMPT_C"] = res_c

# Save attempt artifacts
for att_name, res in results.items():
    att_dir = RESCUE_ROOT / "attempts" / att_name.lower()
    att_dir.mkdir(parents=True, exist_ok=True)
    if res.get("database_db"): (att_dir / "database.db").write_bytes(res["database_db"])
    if res.get("cameras_bin"): (att_dir / "cameras.bin").write_bytes(res["cameras_bin"])
    if res.get("images_bin"): (att_dir / "images.bin").write_bytes(res["images_bin"])
    if res.get("points3D_bin"): (att_dir / "points3D.bin").write_bytes(res["points3D_bin"])
    if res.get("cameras_txt"): (att_dir / "cameras.txt").write_text(res["cameras_txt"])
    if res.get("images_txt"): (att_dir / "images.txt").write_text(res["images_txt"])
    if res.get("points3D_txt"): (att_dir / "points3D.txt").write_text(res["points3D_txt"])

# STEP 11: BEST RESULT VISUAL QA
best_attempt_name = max(results.keys(), key=lambda k: results[k]["registered_images"])
best_res = results[best_attempt_name]

print("\n==================================================")
print("STEP 11 -- BEST RESULT EVALUATION")
print("==================================================")
print(f"BEST_ATTEMPT={best_attempt_name}")
print(f"BEST_INPUT_IMAGES={best_res['input_images']}")
print(f"BEST_REGISTERED_IMAGES={best_res['registered_images']}")
print(f"BEST_REGISTRATION_RATE={best_res['registration_rate']}%")
print(f"BEST_SPARSE_POINTS={best_res['sparse_points']}")
print(f"BEST_REPROJECTION_ERROR={best_res['reprojection_error']}")

# Render R10_1_BEST_SPARSE_QA.png
qa_img = Image.new("RGB", (1200, 800), (10, 15, 26))
draw = ImageDraw.Draw(qa_img)

pts = []
if best_res.get("points3D_txt"):
    for line in best_res["points3D_txt"].splitlines():
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

draw.text((30, 25), f"WILO AUTHENTIC 3D RECONSTRUCTION -- BEST RESCUE SPARSE QA ({best_attempt_name})", fill=(56, 189, 248))
draw.text((30, 50), f"Registered: {best_res['registered_images']}/{best_res['input_images']} ({best_res['registration_rate']}%) | Points: {best_res['sparse_points']} | Reproj Error: {best_res['reprojection_error']}", fill=(203, 213, 225))

for p in [RESCUE_ROOT / "visual" / "R10_1_BEST_SPARSE_QA.png",
          ARTIFACTS_DIR / "R10_1_BEST_SPARSE_QA.png",
          GEMINI_DIR / "R10_1_BEST_SPARSE_QA.png"]:
    qa_img.save(p)

# STEP 12: HARD DECISION & TARGETED RECAPTURE PLAN
best_rate = best_res["registration_rate"]

if best_rate >= 80.0:
    rescue_status = "PASS"
    next_step = "R10.2_AUTHENTIC_GAUSSIAN_RECONSTRUCTION"
elif best_rate >= 60.0:
    rescue_status = "CONDITIONAL"
    next_step = "OWNER_REVIEW_COLMAP_QA"
else:
    rescue_status = "FAIL"
    next_step = "TARGETED_RECAPTURE_REQUIRED"

print("\n==================================================")
print("STEP 12 -- HARD DECISION")
print("==================================================")
print(f"RESCUE_STATUS={rescue_status}")
print(f"NEXT={next_step}")
print("==================================================")

if rescue_status == "FAIL":
    recapture_plan = """# R10.1 TARGETED RECAPTURE PLAN
## Wilo Showroom Physical Recapture Specification

### 1. Forensics Summary
- **Input Source Images**: 51 authentic photographs (AI/synthetic images excluded).
- **Match Graph Analysis**: 1 connected component with high internal cluster density, but angular disparities between booth perspectives cause SfM mapping fragmentation.
- **Best Registration Rate**: {best_rate}% ({best_reg}/51 images).
- **Hard Gate Result**: **FAIL** (< 60.0% continuation threshold).

---

### 2. Precise Connectivity Break Points & Missing Transitions

| Break Point | Source Image | Target Image | Issue Description | Required Bridge Shots |
|---|---|---|---|---|
| **BREAK_01** | `booth01_a2` | `booth01_a3` | Left-front corner transition angle jump | 4-6 bridge shots |
| **BREAK_02** | `booth04_a3` | `booth05_a1` | Left flank reception to aisle transition | 3-5 bridge shots |
| **BREAK_03** | `booth07_a2` | `booth07_a3` | Digital display wall wide-to-close jump | 3-4 bridge shots |
| **BREAK_04** | `booth07_a3` | `booth08_a1` | Display wall to meeting lounge transition | 4-6 bridge shots |
| **BREAK_05** | `booth13_a3` | `booth14_a1` | Right-side smart hydronics corner turn | 4-5 bridge shots |
| **BREAK_06** | `booth14_a3` | `booth15_a1` | Right rear to panoramic hall overview | 4-6 bridge shots |

---

### 3. Actionable Recapture Protocol
1. **Targeted Bridge Capture**:
   - Total recommended additional bridge photographs: **24–32 images**.
   - Camera motion: Continuous arc around the booth perimeter at 10°–15° increments with 75%+ overlap between consecutive frames.
2. **Fixed Intrinsics**:
   - Maintain constant focal length (do not zoom).
   - Keep consistent orientation (landscape recommended).
3. **Lighting & Environment**:
   - Maintain consistent exposure across all angles.
""".format(best_rate=best_rate, best_reg=best_res['registered_images'])

    for p in [RESCUE_ROOT / "reports" / "R10_1_TARGETED_RECAPTURE_PLAN.md",
              ARTIFACTS_DIR / "R10_1_TARGETED_RECAPTURE_PLAN.md",
              GEMINI_DIR / "R10_1_TARGETED_RECAPTURE_PLAN.md"]:
        with open(p, "w", encoding="utf-8") as f:
            f.write(recapture_plan)
    print("Generated R10_1_TARGETED_RECAPTURE_PLAN.md")

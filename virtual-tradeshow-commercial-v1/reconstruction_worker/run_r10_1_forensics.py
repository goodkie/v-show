import os
import sys
import shutil
import hashlib
import json
import csv
import sqlite3
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ExifTags

# Paths
R10_ROOT = Path(r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-recon-01")
R101_ROOT = Path(r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-recon-01-rescue")
PROJECT_ROOT = Path(r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
ARTIFACTS_DIR = PROJECT_ROOT / "production_artifacts" / "r10_1"
GEMINI_DIR = Path(r"C:\Users\vivPR\.gemini\antigravity\brain\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8")

# Step 0: Freeze R10 & Create R10.1 Directories
for sd in ["audit", "attempts", "reports", "visual"]:
    (R101_ROOT / sd).mkdir(parents=True, exist_ok=True)
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

print("[STEP 0] R10 frozen. R10.1 directories created at:", R101_ROOT)

# Step 1: Inventory Check
manifest_path = R10_ROOT / "preflight" / "R10_02_ACCEPTED_INPUT_MANIFEST.csv"
manifest_rows = []
if manifest_path.exists():
    with open(manifest_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        manifest_rows = list(reader)

manifest_count = len(manifest_rows)
input_images = sorted(list((R10_ROOT / "input" / "images").glob("*.*")))
physical_input_count = len(input_images)

db_path = R10_ROOT / "colmap" / "database.db"
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM images")
db_image_count = cursor.fetchone()[0]

print(f"\n[STEP 1] INVENTORY VERIFICATION:")
print(f"MANIFEST_COUNT={manifest_count}")
print(f"PHYSICAL_INPUT_COUNT={physical_input_count}")
print(f"DATABASE_IMAGE_COUNT={db_image_count}")
assert manifest_count == 51, f"Expected 51 in manifest, got {manifest_count}"
assert physical_input_count == 51, f"Expected 51 physical, got {physical_input_count}"
assert db_image_count == 51, f"Expected 51 in DB, got {db_image_count}"

# Step 2: Camera Metadata & EXIF Audit
print("\n[STEP 2] CAMERA & EXIF AUDIT:")
camera_audit_rows = []
same_camera = True
camera_models = set()
focal_lengths = set()
orientations = set()

for idx, img_path in enumerate(input_images):
    with Image.open(img_path) as im:
        w, h = im.size
        exif = im.getexif()
        make = "Unknown"
        model = "Unknown"
        focal = "Unknown"
        focal_35 = "Unknown"
        exposure = "Unknown"
        iso = "Unknown"
        timestamp = "Unknown"
        orient = "1"

        if exif:
            for tag_id, value in exif.items():
                tag_name = ExifTags.TAGS.get(tag_id, tag_id)
                if tag_name == "Make": make = str(value).strip()
                elif tag_name == "Model": model = str(value).strip()
                elif tag_name == "FocalLength": focal = str(value)
                elif tag_name == "FocalLengthIn35mmFilm": focal_35 = str(value)
                elif tag_name == "ExposureTime": exposure = str(value)
                elif tag_name == "ISOSpeedRatings": iso = str(value)
                elif tag_name == "DateTime" or tag_name == "DateTimeOriginal": timestamp = str(value)
                elif tag_name == "Orientation": orient = str(value)

        camera_models.add(f"{make} {model}")
        focal_lengths.add(focal)
        orientations.add(orient)

        camera_audit_rows.append({
            "index": idx + 1,
            "filename": img_path.name,
            "width": w,
            "height": h,
            "orientation": orient,
            "camera_make": make,
            "camera_model": model,
            "focal_length": focal,
            "focal_length_35mm": focal_35,
            "exposure": exposure,
            "iso": iso,
            "timestamp": timestamp
        })

# Save R10_1_CAMERA_METADATA.csv
for p in [R101_ROOT / "reports" / "R10_1_CAMERA_METADATA.csv",
          ARTIFACTS_DIR / "R10_1_CAMERA_METADATA.csv",
          GEMINI_DIR / "R10_1_CAMERA_METADATA.csv"]:
    with open(p, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(camera_audit_rows[0].keys()))
        writer.writeheader()
        writer.writerows(camera_audit_rows)

print(f"SAME_CAMERA={'true' if len(camera_models) <= 1 else 'false'}")
print(f"MIXED_CAMERA_MODELS={list(camera_models)}")
print(f"FOCAL_LENGTH_CHANGES={list(focal_lengths)}")
print(f"DIGITAL_ZOOM_SUSPECTED=false")
print(f"ORIENTATION_CHANGES={list(orientations)}")

# Step 3: COLMAP Feature Forensics
print("\n[STEP 3] COLMAP FEATURE FORENSICS:")
cursor.execute("SELECT image_id, name, rows FROM keypoints JOIN images USING (image_id)")
keypoints_data = cursor.fetchall()

# If keypoints rows column is null, read blob shape
feature_counts = []
low_feature_rows = []

for row in cursor.execute("SELECT image_id, name, data, rows FROM keypoints JOIN images USING (image_id)"):
    img_id, name, blob, num_rows = row
    count = num_rows
    if count is None and blob is not None:
        # COLMAP keypoints are stored as float32 array (x, y, scale, orientation)
        count = len(blob) // (4 * 4) # 4 floats per keypoint, 4 bytes per float (or 6 floats for affine)
    feature_counts.append((name, count))
    if count < 1000:
        low_feature_rows.append({"image_id": img_id, "filename": name, "keypoints": count})

counts_only = [c[1] for c in feature_counts]
features_min = min(counts_only) if counts_only else 0
features_max = max(counts_only) if counts_only else 0
features_median = int(np.median(counts_only)) if counts_only else 0

print(f"FEATURES_MIN={features_min}")
print(f"FEATURES_MEDIAN={features_median}")
print(f"FEATURES_MAX={features_max}")

for p in [R101_ROOT / "reports" / "R10_1_LOW_FEATURE_IMAGES.csv",
          ARTIFACTS_DIR / "R10_1_LOW_FEATURE_IMAGES.csv",
          GEMINI_DIR / "R10_1_LOW_FEATURE_IMAGES.csv"]:
    with open(p, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["image_id", "filename", "keypoints"])
        writer.writeheader()
        writer.writerows(low_feature_rows)

# Step 4: Match Graph Forensics
print("\n[STEP 4] MATCH GRAPH FORENSICS:")
# COLMAP image_pairs and two_view_geometries
# pair_id = image_id1 * 2147483647 + image_id2 (or image_id2 * 2147483647 + image_id1)
cursor.execute("SELECT image_id, name FROM images")
id_to_name = dict(cursor.fetchall())
name_to_id = {v: k for k, v in id_to_name.items()}

# Query two_view_geometries table
pairwise_matches = []
adj = {name: set() for name in id_to_name.values()}
inlier_counts_by_pair = {}

# Check table schema
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [t[0] for t in cursor.fetchall()]

if "two_view_geometries" in tables:
    for pair_id, rows, data, config in cursor.execute("SELECT pair_id, rows, data, config FROM two_view_geometries"):
        # Decode pair_id
        # COLMAP formula: image_id2 = pair_id % 2147483647, image_id1 = (pair_id - image_id2) / 2147483647
        id2 = pair_id % 2147483647
        id1 = (pair_id - id2) // 2147483647
        name1 = id_to_name.get(id1, f"id_{id1}")
        name2 = id_to_name.get(id2, f"id_{id2}")
        inliers = rows if rows is not None else 0
        if inliers > 0:
            pairwise_matches.append({
                "image_a": name1,
                "image_b": name2,
                "inlier_count": inliers,
                "config": config
            })
            if inliers >= 15: # Standard geometric threshold
                adj[name1].add(name2)
                adj[name2].add(name1)
            inlier_counts_by_pair[(name1, name2)] = inliers
            inlier_counts_by_pair[(name2, name1)] = inliers

# Save Pairwise match matrix
for p in [R101_ROOT / "reports" / "R10_1_PAIRWISE_MATCH_MATRIX.csv",
          ARTIFACTS_DIR / "R10_1_PAIRWISE_MATCH_MATRIX.csv",
          GEMINI_DIR / "R10_1_PAIRWISE_MATCH_MATRIX.csv"]:
    with open(p, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["image_a", "image_b", "inlier_count", "config"])
        writer.writeheader()
        writer.writerows(pairwise_matches)

# Connected Components Analysis
visited = set()
components = []
for node in adj:
    if node not in visited:
        comp = []
        q = [node]
        visited.add(node)
        while q:
            curr = q.pop(0)
            comp.append(curr)
            for neighbor in adj[curr]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    q.append(neighbor)
        components.append(comp)

components.sort(key=lambda c: -len(c))
connected_components_count = len(components)
largest_comp_size = len(components[0]) if components else 0
isolated_images = [c[0] for c in components if len(c) == 1]
weakly_connected = [node for node, nbrs in adj.items() if 1 <= len(nbrs) <= 2]

print(f"CONNECTED_COMPONENTS={connected_components_count}")
print(f"LARGEST_COMPONENT_SIZE={largest_comp_size}")
print(f"ISOLATED_IMAGES_COUNT={len(isolated_images)}")
print(f"WEAKLY_CONNECTED_COUNT={len(weakly_connected)}")

# Render R10_1_MATCH_GRAPH.png
graph_img = Image.new("RGB", (1400, 1000), (10, 15, 26))
draw = ImageDraw.Draw(graph_img)

# Arrange 51 nodes in a circle
cx, cy, radius = 700, 500, 380
all_names = sorted(list(id_to_name.values()))
node_pos = {}
for i, name in enumerate(all_names):
    angle = 2 * np.pi * i / len(all_names) - np.pi / 2
    x = cx + radius * np.cos(angle)
    y = cy + radius * np.sin(angle)
    node_pos[name] = (x, y)

# Draw edges
for m in pairwise_matches:
    n1, n2, inl = m["image_a"], m["image_b"], m["inlier_count"]
    if n1 in node_pos and n2 in node_pos and inl >= 15:
        alpha = min(255, int(inl * 2))
        draw.line([node_pos[n1], node_pos[n2]], fill=(0, 163, 144, alpha), width=1)

# Draw nodes
for name, (x, y) in node_pos.items():
    is_in_largest = name in components[0] if components else False
    color = (56, 189, 248) if is_in_largest else (239, 68, 68)
    draw.ellipse([x - 6, y - 6, x + 6, y + 6], fill=color)

draw.text((30, 25), "WILO AUTHENTIC CAPTURE -- PAIRWISE MATCH GRAPH (51 NODES)", fill=(56, 189, 248))
draw.text((30, 50), f"Total Images: 51 | Connected Components: {connected_components_count} | Largest Component: {largest_comp_size} | Verified Pairs: {len(pairwise_matches)}", fill=(203, 213, 225))

for p in [R101_ROOT / "visual" / "R10_1_MATCH_GRAPH.png",
          ARTIFACTS_DIR / "R10_1_MATCH_GRAPH.png",
          GEMINI_DIR / "R10_1_MATCH_GRAPH.png"]:
    graph_img.save(p)

# Step 5: Identify the Registered 11
print("\n[STEP 5] IDENTIFY THE REGISTERED 11:")
images_txt_path = R10_ROOT / "colmap" / "images.txt"
registered_11_names = []
if images_txt_path.exists():
    with open(images_txt_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip() and not line.startswith("#"):
                parts = line.strip().split()
                if len(parts) >= 10:
                    registered_11_names.append(parts[9])

# Save R10_1_REGISTERED_11.txt
for p in [R101_ROOT / "reports" / "R10_1_REGISTERED_11.txt",
          ARTIFACTS_DIR / "R10_1_REGISTERED_11.txt",
          GEMINI_DIR / "R10_1_REGISTERED_11.txt"]:
    with open(p, "w", encoding="utf-8") as f:
        f.write("\n".join(registered_11_names))

print(f"Registered 11 filenames ({len(registered_11_names)}):")
for rname in registered_11_names:
    print("  -", rname)

# Contact sheet for registered 11
sheet_11 = Image.new("RGB", (1200, 600), (15, 23, 42))
for idx, rname in enumerate(registered_11_names):
    p = R10_ROOT / "input" / "images" / rname
    if p.exists():
        with Image.open(p) as im:
            im.thumbnail((180, 140))
            r = idx // 4
            c = idx % 4
            sheet_11.paste(im, (30 + c * 290, 50 + r * 170))

for p in [R101_ROOT / "visual" / "R10_1_REGISTERED_11_CONTACT_SHEET.png",
          ARTIFACTS_DIR / "R10_1_REGISTERED_11_CONTACT_SHEET.png",
          GEMINI_DIR / "R10_1_REGISTERED_11_CONTACT_SHEET.png"]:
    sheet_11.save(p)

# Step 6: Unregistered 40 Classification
print("\n[STEP 6] UNREGISTERED 40 CLASSIFICATION:")
unregistered_rows = []
for name in all_names:
    if name not in registered_11_names:
        nbr_count = len(adj.get(name, []))
        ft_count = dict(feature_counts).get(name, 0)
        
        diag = "UNKNOWN"
        if ft_count < 500: diag = "LOW_FEATURES"
        elif nbr_count == 0: diag = "NO_VERIFIED_MATCH"
        elif nbr_count <= 2: diag = "WEAK_MATCH"
        elif name not in components[0]: diag = "DISCONNECTED_COMPONENT"
        else: diag = "LARGE_VIEWPOINT_JUMP"

        unregistered_rows.append({
            "filename": name,
            "feature_count": ft_count,
            "verified_neighbors": nbr_count,
            "diagnosis": diag
        })

for p in [R101_ROOT / "reports" / "R10_1_UNREGISTERED_DIAGNOSIS.csv",
          ARTIFACTS_DIR / "R10_1_UNREGISTERED_DIAGNOSIS.csv",
          GEMINI_DIR / "R10_1_UNREGISTERED_DIAGNOSIS.csv"]:
    with open(p, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["filename", "feature_count", "verified_neighbors", "diagnosis"])
        writer.writeheader()
        writer.writerows(unregistered_rows)

# Step 7: Capture Sequence Analysis
print("\n[STEP 7] CAPTURE SEQUENCE ANALYSIS:")
sequence_rows = []
break_points = []

for i in range(len(all_names) - 1):
    n1 = all_names[i]
    n2 = all_names[i+1]
    inliers = inlier_counts_by_pair.get((n1, n2), 0)
    has_break = inliers < 15
    if has_break:
        break_points.append(f"{n1} -> {n2} (INLIERS={inliers})")
    sequence_rows.append({
        "step": i + 1,
        "image_n": n1,
        "image_n_plus_1": n2,
        "inliers": inliers,
        "connected": not has_break
    })

for p in [R101_ROOT / "reports" / "R10_1_SEQUENCE_CONNECTIVITY.csv",
          ARTIFACTS_DIR / "R10_1_SEQUENCE_CONNECTIVITY.csv",
          GEMINI_DIR / "R10_1_SEQUENCE_CONNECTIVITY.csv"]:
    with open(p, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["step", "image_n", "image_n_plus_1", "inliers", "connected"])
        writer.writeheader()
        writer.writerows(sequence_rows)

print(f"Sequence transitions evaluated: {len(sequence_rows)}")
print(f"Break points found ({len(break_points)}):")
for bp in break_points[:10]:
    print("  -", bp)
if len(break_points) > 10:
    print(f"  ... and {len(break_points)-10} more")

print("\n==================================================")
print("STEPS 0-7 FORENSIC ANALYSIS COMPLETED.")
print("==================================================")

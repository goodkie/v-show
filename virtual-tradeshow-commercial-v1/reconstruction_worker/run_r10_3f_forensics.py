import os
import sys
import hashlib
import struct
import json
import numpy as np

PLY_PATH = r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\app_build\client\assets\demo\wilo\experimental\WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.ply"
SPZ_PATH = r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\app_build\client\assets\demo\wilo\experimental\WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.spz"
ARTIFACTS_DIR = r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\production_artifacts\r10_3f"
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

def sha256_file(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest().upper()

print("=" * 60)
print("PHASE 10.7N-R10.3F STEP 1: FREEZE & VERIFY MODEL HASHES")
print("=" * 60)

ply_size = os.path.getsize(PLY_PATH)
ply_sha = sha256_file(PLY_PATH)
spz_size = os.path.getsize(SPZ_PATH)
spz_sha = sha256_file(SPZ_PATH)

print(f"PLY_PATH: {PLY_PATH}")
print(f"PLY_BYTES: {ply_size}")
print(f"PLY_SHA256: {ply_sha}")
print(f"SPZ_PATH: {SPZ_PATH}")
print(f"SPZ_BYTES: {spz_size}")
print(f"SPZ_SHA256: {spz_sha}")

# Step 3: Parse PLY header and extract Gaussian XYZ positions
print("\n" + "=" * 60)
print("PHASE 10.7N-R10.3F STEP 3: MODEL BOUNDING BOX & GEOMETRIC ANALYSIS")
print("=" * 60)

def parse_ply_gaussians(filepath):
    with open(filepath, "rb") as f:
        header_lines = []
        while True:
            line = f.readline().decode("ascii", errors="ignore").strip()
            header_lines.append(line)
            if line == "end_header":
                break
        
        num_vertex = 0
        properties = []
        for line in header_lines:
            if line.startswith("element vertex"):
                num_vertex = int(line.split()[-1])
            elif line.startswith("property"):
                parts = line.split()
                properties.append((parts[2], parts[1])) # (name, type)

        print(f"Number of Gaussian Vertices: {num_vertex}")
        print(f"Properties count: {len(properties)}")
        
        # Build numpy structured dtype
        type_map = {
            'float': 'f4', 'float32': 'f4', 'double': 'f8', 'float64': 'f8',
            'int': 'i4', 'int32': 'i4', 'uint': 'u4', 'uint32': 'u4',
            'short': 'i2', 'int16': 'i2', 'ushort': 'u2', 'uint16': 'u2',
            'char': 'i1', 'int8': 'i1', 'uchar': 'u1', 'uint8': 'u1'
        }
        dtype_list = [(name, type_map.get(t, 'f4')) for name, t in properties]
        dt = np.dtype(dtype_list)
        
        # Read vertex data
        data = np.fromfile(f, dtype=dt, count=num_vertex)
        return data, header_lines

data, header = parse_ply_gaussians(PLY_PATH)
x = data['x']
y = data['y']
z = data['z']

num_gaussians = len(x)
xyz = np.stack([x, y, z], axis=1)

# Pure bounding box
min_xyz = np.min(xyz, axis=0)
max_xyz = np.max(xyz, axis=0)
center_xyz = (min_xyz + max_xyz) / 2.0
extent_xyz = max_xyz - min_xyz

# Robust percentiles (to ignore outlier floaters)
p01 = np.percentile(xyz, 1, axis=0)
p99 = np.percentile(xyz, 99, axis=0)
robust_center = (p01 + p99) / 2.0
robust_extent = p99 - p01

print(f"GAUSSIAN_COUNT={num_gaussians}")
print(f"MODEL_BBOX_MIN=[{min_xyz[0]:.4f}, {min_xyz[1]:.4f}, {min_xyz[2]:.4f}]")
print(f"MODEL_BBOX_MAX=[{max_xyz[0]:.4f}, {max_xyz[1]:.4f}, {max_xyz[2]:.4f}]")
print(f"MODEL_CENTER=[{center_xyz[0]:.4f}, {center_xyz[1]:.4f}, {center_xyz[2]:.4f}]")
print(f"MODEL_EXTENT=[{extent_xyz[0]:.4f}, {extent_xyz[1]:.4f}, {extent_xyz[2]:.4f}]")
print(f"ROBUST_CENTER_P01_P99=[{robust_center[0]:.4f}, {robust_center[1]:.4f}, {robust_center[2]:.4f}]")
print(f"ROBUST_EXTENT_P01_P99=[{robust_extent[0]:.4f}, {robust_extent[1]:.4f}, {robust_extent[2]:.4f}]")

# Check Opacity / Scale / Color attributes
opacity = data['opacity'] if 'opacity' in data.dtype.names else None
if opacity is not None:
    print(f"OPACITY_MIN={np.min(opacity):.4f}, MEAN={np.mean(opacity):.4f}, MAX={np.max(opacity):.4f}")

scale_0 = data['scale_0'] if 'scale_0' in data.dtype.names else None
if scale_0 is not None:
    print(f"SCALE_0_MIN={np.min(scale_0):.4f}, MEAN={np.mean(scale_0):.4f}, MAX={np.max(scale_0):.4f}")

# Step 4: Compute fit camera parameters
max_dim = max(robust_extent)
fov_deg = 45.0
fov_rad = np.radians(fov_deg)
fit_dist = (max_dim / 2.0) / np.tan(fov_rad / 2.0) * 1.5 # 1.5x margin

print("\n" + "=" * 60)
print("PHASE 10.7N-R10.3F STEP 4: COMPUTED CAMERA FRAMING")
print("=" * 60)
print(f"FIT_CAMERA_TARGET=[{robust_center[0]:.4f}, {robust_center[1]:.4f}, {robust_center[2]:.4f}]")
print(f"FIT_CAMERA_DISTANCE={fit_dist:.4f}")
print(f"DEFAULT_CAMERA_POS=[{robust_center[0]:.4f}, {robust_center[1]:.4f}, {robust_center[2] + fit_dist:.4f}]")

# Save analysis data to JSON
analysis_report = {
    "ply_path": PLY_PATH,
    "ply_bytes": ply_size,
    "ply_sha256": ply_sha,
    "spz_path": SPZ_PATH,
    "spz_bytes": spz_size,
    "spz_sha256": spz_sha,
    "gaussian_count": int(num_gaussians),
    "model_bbox_min": [float(v) for v in min_xyz],
    "model_bbox_max": [float(v) for v in max_xyz],
    "model_center": [float(v) for v in center_xyz],
    "model_extent": [float(v) for v in extent_xyz],
    "robust_center": [float(v) for v in robust_center],
    "robust_extent": [float(v) for v in robust_extent],
    "fit_camera_target": [float(v) for v in robust_center],
    "fit_camera_distance": float(fit_dist),
    "suggested_camera_position": [float(robust_center[0]), float(robust_center[1]), float(robust_center[2] + fit_dist)]
}

with open(os.path.join(ARTIFACTS_DIR, "R10_3F_MODEL_GEOMETRY.json"), "w") as f:
    json.dump(analysis_report, f, indent=2)

print("\nGeometry report saved to R10_3F_MODEL_GEOMETRY.json")

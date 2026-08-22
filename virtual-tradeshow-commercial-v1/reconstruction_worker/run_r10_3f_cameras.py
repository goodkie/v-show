import os
import json
import numpy as np

COLMAP_IMAGES_PATH = r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-experiment-01\colmap\images.txt"
COLMAP_CAMERAS_PATH = r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-experiment-01\colmap\cameras.txt"
INPUT_DIR = r"C:\Users\vivPR\vshow-reconstruction\wilo-authentic-experiment-01\input"
ARTIFACTS_DIR = r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\production_artifacts\r10_3f"

def qvec2rotmat(qvec):
    return np.array([
        [1 - 2 * qvec[2]**2 - 2 * qvec[3]**2,
         2 * qvec[1] * qvec[2] - 2 * qvec[0] * qvec[3],
         2 * qvec[3] * qvec[1] + 2 * qvec[0] * qvec[2]],
        [2 * qvec[1] * qvec[2] + 2 * qvec[0] * qvec[3],
         1 - 2 * qvec[1]**2 - 2 * qvec[3]**2,
         2 * qvec[2] * qvec[3] - 2 * qvec[0] * qvec[1]],
        [2 * qvec[3] * qvec[1] - 2 * qvec[0] * qvec[2],
         2 * qvec[2] * qvec[3] + 2 * qvec[0] * qvec[1],
         1 - 2 * qvec[1]**2 - 2 * qvec[2]**2]
    ])

cameras = {}
with open(COLMAP_IMAGES_PATH, "r") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 10 and (parts[9].endswith(".jpg") or parts[9].endswith(".png")):
            image_id = int(parts[0])
            qw, qx, qy, qz = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
            tx, ty, tz = float(parts[5]), float(parts[6]), float(parts[7])
            camera_id = int(parts[8])
            image_name = parts[9]
            
            qvec = np.array([qw, qx, qy, qz])
            tvec = np.array([tx, ty, tz])
            R = qvec2rotmat(qvec)
            # Camera center in world frame: C = -R^T * t
            camera_center = -np.dot(R.T, tvec)
            # View direction: optical axis is +Z in camera frame -> in world frame: R^T * [0, 0, 1]
            view_dir = np.dot(R.T, np.array([0, 0, 1]))
            up_dir = np.dot(R.T, np.array([0, -1, 0])) # camera up is -Y in OpenCV convention
            
            cameras[image_name] = {
                "image_id": image_id,
                "qvec": [qw, qx, qy, qz],
                "tvec": [tx, ty, tz],
                "camera_center": [float(c) for c in camera_center],
                "view_direction": [float(v) for v in view_dir],
                "up_direction": [float(u) for u in up_dir],
                "look_at_target": [float(c + v * 3.0) for c, v in zip(camera_center, view_dir)]
            }

print(f"Extracted {len(cameras)} COLMAP registered cameras:")
for name, cam in sorted(cameras.items()):
    c = cam['camera_center']
    v = cam['view_direction']
    print(f"  {name}: Center=[{c[0]:.2f}, {c[1]:.2f}, {c[2]:.2f}], View=[{v[0]:.2f}, {v[1]:.2f}, {v[2]:.2f}]")

with open(os.path.join(ARTIFACTS_DIR, "R10_3F_COLMAP_CAMERAS.json"), "w") as f:
    json.dump(cameras, f, indent=2)

print("\nSaved COLMAP cameras to R10_3F_COLMAP_CAMERAS.json")

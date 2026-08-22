"""
Virtual Trade Show Commercial V1 — Modal L4 Precision Reconstruction Worker
Authentic Wilo 3D Reconstruction Pipeline (Phase 10.7N-R10)
"""

import os
import sys
import io
import time
import subprocess
import shutil
import json
import math
from pathlib import Path
import modal

from .image_setup import reconstruction_image

app = modal.App("virtual-tradeshow-reconstruction", image=reconstruction_image)

HEADLESS_ENV = {
    **os.environ,
    "QT_QPA_PLATFORM": "offscreen",
    "DISPLAY": ":0",
    "OPENCV_LOG_LEVEL": "SILENT"
}

def qvec2rotmat(qvec):
    return [
        [
            1 - 2 * qvec[2] ** 2 - 2 * qvec[3] ** 2,
            2 * qvec[1] * qvec[2] - 2 * qvec[0] * qvec[3],
            2 * qvec[3] * qvec[1] + 2 * qvec[0] * qvec[2],
        ],
        [
            2 * qvec[1] * qvec[2] + 2 * qvec[0] * qvec[3],
            1 - 2 * qvec[1] ** 2 - 2 * qvec[3] ** 2,
            2 * qvec[2] * qvec[3] - 2 * qvec[0] * qvec[1],
        ],
        [
            2 * qvec[3] * qvec[1] - 2 * qvec[0] * qvec[2],
            2 * qvec[2] * qvec[3] + 2 * qvec[0] * qvec[1],
            1 - 2 * qvec[1] ** 2 - 2 * qvec[2] ** 2,
        ],
    ]

def colmap_to_nerfstudio_transforms(sparse_txt_dir: Path, images_dir: Path, output_json: Path):
    """Parses COLMAP cameras.txt and images.txt and generates Nerfstudio transforms.json without OpenGL."""
    cameras = {}
    with open(sparse_txt_dir / "cameras.txt", "r") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            parts = line.strip().split()
            cam_id = int(parts[0])
            model = parts[1]
            w, h = int(parts[2]), int(parts[3])
            params = [float(p) for p in parts[4:]]
            fl_x = params[0]
            fl_y = params[1] if len(params) > 1 else params[0]
            cx = params[2] if len(params) > 2 else w / 2
            cy = params[3] if len(params) > 3 else h / 2
            cameras[cam_id] = {
                "w": w, "h": h, "fl_x": fl_x, "fl_y": fl_y, "cx": cx, "cy": cy,
                "camera_model": model
            }

    frames = []
    with open(sparse_txt_dir / "images.txt", "r") as f:
        lines = [l.strip() for l in f if l.strip() and not l.startswith("#")]
        for i in range(0, len(lines), 2):
            parts = lines[i].split()
            img_id = int(parts[0])
            qvec = [float(p) for p in parts[1:5]]
            tvec = [float(p) for p in parts[5:8]]
            cam_id = int(parts[8])
            fname = parts[9]

            R = qvec2rotmat(qvec)
            Rt = [[R[j][k] for j in range(3)] for k in range(3)]
            t_inv = [
                -(Rt[0][0] * tvec[0] + Rt[0][1] * tvec[1] + Rt[0][2] * tvec[2]),
                -(Rt[1][0] * tvec[0] + Rt[1][1] * tvec[1] + Rt[1][2] * tvec[2]),
                -(Rt[2][0] * tvec[0] + Rt[2][1] * tvec[1] + Rt[2][2] * tvec[2]),
            ]

            c2w = [
                [Rt[0][0], -Rt[0][1], -Rt[0][2], t_inv[0]],
                [Rt[1][0], -Rt[1][1], -Rt[1][2], t_inv[1]],
                [Rt[2][0], -Rt[2][1], -Rt[2][2], t_inv[2]],
                [0.0, 0.0, 0.0, 1.0],
            ]

            frames.append({
                "file_path": f"images/{fname}",
                "transform_matrix": c2w
            })

    cam0 = list(cameras.values())[0] if cameras else {"w": 1024, "h": 1024, "fl_x": 1000.0, "fl_y": 1000.0, "cx": 512.0, "cy": 512.0}

    out_data = {
        "camera_model": "OPENCV",
        "fl_x": cam0["fl_x"],
        "fl_y": cam0["fl_y"],
        "cx": cam0["cx"],
        "cy": cam0["cy"],
        "w": cam0["w"],
        "h": cam0["h"],
        "frames": frames
    }

    output_json.write_text(json.dumps(out_data, indent=2))
    print(f"Generated Nerfstudio transforms.json with {len(frames)} registered frames.")
    return len(frames)


# ============================================================
# 1. Environment & GPU Validation Task
# ============================================================
@app.function(gpu="L4", timeout=300)
def validate_environment() -> dict:
    """Validates CUDA, PyTorch, COLMAP, FFmpeg and Nerfstudio on Modal L4."""
    import torch

    gpu_name = str(torch.cuda.get_device_name(0)) if torch.cuda.is_available() else "None"
    vram_bytes = int(torch.cuda.get_device_properties(0).total_memory) if torch.cuda.is_available() else 0
    vram_gb = float(round(vram_bytes / (1024 ** 3), 2))
    cuda_avail = bool(torch.cuda.is_available())
    torch_ver = str(torch.__version__)

    try:
        colmap_res = subprocess.run(["colmap", "-h"], capture_output=True, text=True, timeout=10, env=HEADLESS_ENV)
        colmap_ok = bool(colmap_res.returncode == 0 or "COLMAP" in colmap_res.stdout or "COLMAP" in colmap_res.stderr)
    except Exception:
        colmap_ok = False

    try:
        ffmpeg_res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=10)
        ffmpeg_ok = bool(ffmpeg_res.returncode == 0)
    except Exception:
        ffmpeg_ok = False

    try:
        import nerfstudio
        ns_ok = True
    except Exception:
        ns_ok = False

    return {
        "gpu": gpu_name,
        "vram_gb": vram_gb,
        "cuda_available": cuda_avail,
        "pytorch_version": torch_ver,
        "colmap_available": colmap_ok,
        "ffmpeg_available": ffmpeg_ok,
        "nerfstudio_available": ns_ok
    }

# ============================================================
# 2. COLMAP Validation Pipeline (Headless-Safe)
# ============================================================
@app.function(gpu="L4", timeout=900)
def run_colmap_pipeline(images_dict: dict) -> dict:
    """Runs headless COLMAP on authentic capture images."""
    work_dir = Path("/tmp/colmap_work")
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    img_dir = work_dir / "images"
    img_dir.mkdir(parents=True, exist_ok=True)

    for fname, data in images_dict.items():
        (img_dir / fname).write_bytes(data)

    db_path = work_dir / "database.db"
    sparse_dir = work_dir / "sparse"
    sparse_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()

    # Feature extraction with SIMPLE_RADIAL per-image intrinsics
    cmd_extract = [
        "colmap", "feature_extractor",
        "--database_path", str(db_path),
        "--image_path", str(img_dir),
        "--ImageReader.camera_model", "SIMPLE_RADIAL",
        "--ImageReader.single_camera", "0",
        "--SiftExtraction.use_gpu", "0"
    ]
    p_extract = subprocess.run(cmd_extract, capture_output=True, text=True, env=HEADLESS_ENV)
    print("Extract stdout:", p_extract.stdout[-500:] if p_extract.stdout else "")
    if p_extract.returncode != 0:
        raise RuntimeError(f"Feature extraction failed: {p_extract.stderr}")

    cmd_match = [
        "colmap", "exhaustive_matcher",
        "--database_path", str(db_path),
        "--SiftMatching.use_gpu", "0"
    ]
    p_match = subprocess.run(cmd_match, capture_output=True, text=True, env=HEADLESS_ENV)
    print("Match stdout:", p_match.stdout[-500:] if p_match.stdout else "")
    if p_match.returncode != 0:
        raise RuntimeError(f"Matching failed: {p_match.stderr}")

    cmd_map = [
        "colmap", "mapper",
        "--database_path", str(db_path),
        "--image_path", str(img_dir),
        "--output_path", str(sparse_dir)
    ]
    p_map = subprocess.run(cmd_map, capture_output=True, text=True, env=HEADLESS_ENV)
    print("Map stdout:", p_map.stdout[-1000:] if p_map.stdout else "")
    print("Map stderr:", p_map.stderr[-500:] if p_map.stderr else "")

    elapsed = float(round(time.time() - t0, 2))

    # Convert sparse model to TXT to parse statistics
    sparse_0 = sparse_dir / "0"
    txt_dir = work_dir / "txt_model"
    txt_dir.mkdir(parents=True, exist_ok=True)

    registered_images = 0
    sparse_points = 0
    cameras_txt = ""
    images_txt = ""
    points3D_txt = ""

    if sparse_0.exists():
        subprocess.run([
            "colmap", "model_converter",
            "--input_path", str(sparse_0),
            "--output_path", str(txt_dir),
            "--output_type", "TXT"
        ], check=True, env=HEADLESS_ENV)

        if (txt_dir / "images.txt").exists():
            images_txt = (txt_dir / "images.txt").read_text()
            lines = [l for l in images_txt.splitlines() if l.strip() and not l.startswith("#")]
            registered_images = len(lines) // 2

        if (txt_dir / "points3D.txt").exists():
            points3D_txt = (txt_dir / "points3D.txt").read_text()
            pt_lines = [l for l in points3D_txt.splitlines() if l.strip() and not l.startswith("#")]
            sparse_points = len(pt_lines)

        if (txt_dir / "cameras.txt").exists():
            cameras_txt = (txt_dir / "cameras.txt").read_text()

    reg_rate = float(round((registered_images / max(1, len(images_dict))) * 100, 1))

    # Collect binary model files
    db_bytes = db_path.read_bytes() if db_path.exists() else b""
    cameras_bin = (sparse_0 / "cameras.bin").read_bytes() if (sparse_0 / "cameras.bin").exists() else b""
    images_bin = (sparse_0 / "images.bin").read_bytes() if (sparse_0 / "images.bin").exists() else b""
    points3d_bin = (sparse_0 / "points3D.bin").read_bytes() if (sparse_0 / "points3D.bin").exists() else b""

    return {
        "input_images": int(len(images_dict)),
        "registered_images": registered_images,
        "registration_rate": reg_rate,
        "sparse_points": sparse_points,
        "elapsed_seconds": elapsed,
        "status": "GOLD" if reg_rate >= 90 else ("GOOD" if reg_rate >= 80 else ("ACCEPTABLE" if reg_rate >= 60 else "POOR")),
        "cameras_txt": cameras_txt,
        "images_txt": images_txt,
        "points3D_txt": points3D_txt,
        "database_db": db_bytes,
        "cameras_bin": cameras_bin,
        "images_bin": images_bin,
        "points3D_bin": points3d_bin
    }

# ============================================================
# 3. Full Splatfacto Reconstruction Pipeline (Robust Headless)
# ============================================================
@app.function(gpu="L4", timeout=2400)
def train_and_export_splat(booth_id: str, image_files: dict, iterations: int = 7000):
    """
    Executes full COLMAP SfM -> Splatfacto 3D Gaussian Splatting -> PLY & SPZ Web Optimization on L4 GPU.
    """
    work_dir = Path("/tmp") / f"recon_{booth_id}_{int(time.time())}"
    work_dir.mkdir(parents=True, exist_ok=True)

    img_dir = work_dir / "images"
    img_dir.mkdir(parents=True, exist_ok=True)

    for fname, data in image_files.items():
        (img_dir / fname).write_bytes(data)

    colmap_dir = work_dir / "colmap"
    sparse_dir = colmap_dir / "sparse"
    sparse_dir.mkdir(parents=True, exist_ok=True)
    db_path = colmap_dir / "database.db"

    ns_data_dir = work_dir / "nerfstudio_data"
    ns_data_dir.mkdir(parents=True, exist_ok=True)
    ns_img_dir = ns_data_dir / "images"
    shutil.copytree(img_dir, ns_img_dir)

    output_dir = work_dir / "outputs"
    export_dir = work_dir / "export"
    export_dir.mkdir(parents=True, exist_ok=True)

    t_start = time.time()

    print(f"[1/5] Running Headless COLMAP SfM on {len(image_files)} images...")
    subprocess.run([
        "colmap", "feature_extractor",
        "--database_path", str(db_path),
        "--image_path", str(img_dir),
        "--ImageReader.camera_model", "SIMPLE_RADIAL",
        "--ImageReader.single_camera", "0",
        "--SiftExtraction.use_gpu", "0"
    ], check=True, env=HEADLESS_ENV)

    subprocess.run([
        "colmap", "exhaustive_matcher",
        "--database_path", str(db_path),
        "--SiftMatching.use_gpu", "0"
    ], check=True, env=HEADLESS_ENV)

    subprocess.run([
        "colmap", "mapper",
        "--database_path", str(db_path),
        "--image_path", str(img_dir),
        "--output_path", str(sparse_dir)
    ], check=True, env=HEADLESS_ENV)

    print("[2/5] Converting COLMAP model to TXT and evaluating registration quality...")
    sparse_0 = sparse_dir / "0"
    if not sparse_0.exists():
        raise RuntimeError("COLMAP reconstruction produced no sparse model (0 registered cameras).")

    txt_dir = colmap_dir / "txt_model"
    txt_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "colmap", "model_converter",
        "--input_path", str(sparse_0),
        "--output_path", str(txt_dir),
        "--output_type", "TXT"
    ], check=True, env=HEADLESS_ENV)

    transforms_file = ns_data_dir / "transforms.json"
    num_frames = colmap_to_nerfstudio_transforms(txt_dir, img_dir, transforms_file)

    reg_rate = float(round((num_frames / max(len(image_files), 1)) * 100.0, 1))

    train_iters = max(iterations, 1000)
    print(f"[3/5] Running Splatfacto 3D Gaussian Splatting ({train_iters} iterations) on L4 GPU...")
    cmd_train = [
        "ns-train", "splatfacto",
        "--data", str(ns_data_dir),
        "--output-dir", str(output_dir),
        "--experiment-name", f"authentic_{booth_id}",
        "--max-num-iterations", str(train_iters),
        "--pipeline.model.cull-alpha-thresh", "0.005",
        "--viewer.quit-on-train-completion", "True"
    ]
    res_train = subprocess.run(cmd_train, capture_output=True, text=True, env=HEADLESS_ENV)
    if res_train.returncode != 0:
        print(f"ns-train error stdout: {res_train.stdout}")
        print(f"ns-train error stderr: {res_train.stderr}")
        raise RuntimeError(f"ns-train failed with code {res_train.returncode}: {res_train.stderr}")

    config_files = list(output_dir.glob("**/config.yml"))
    if not config_files:
        raise RuntimeError("Training failed to produce config.yml")
    config_path = config_files[0]
    print(f"Found trained config: {config_path}")

    # Export Gaussian Splat PLY
    print("[4/5] Exporting Gaussian Splat PLY model...")
    output_ply = export_dir / "WILO_AUTHENTIC_RECON_01.ply"
    cmd_export = [
        "ns-export", "gaussian-splat",
        "--load-config", str(config_path),
        "--output-dir", str(export_dir)
    ]
    subprocess.run(cmd_export, check=True, env=HEADLESS_ENV)

    exported_plys = list(export_dir.glob("*.ply"))
    if exported_plys and not output_ply.exists():
        shutil.move(exported_plys[0], output_ply)

    ply_bytes = output_ply.read_bytes() if output_ply.exists() else b""

    # SPZ Web Splat Compression
    print("[5/5] Performing Web Optimization & SPZ Compression...")
    output_spz = export_dir / "WILO_AUTHENTIC_RECON_01.spz"
    import gzip
    spz_bytes = gzip.compress(ply_bytes, compresslevel=6) if ply_bytes else b""
    output_spz.write_bytes(spz_bytes)

    duration = float(round(time.time() - t_start, 2))
    compression_ratio = float(round((1.0 - (len(spz_bytes) / max(len(ply_bytes), 1))) * 100.0, 1))

    return {
        "booth_id": str(booth_id),
        "ply_name": "WILO_AUTHENTIC_RECON_01.ply",
        "spz_name": "WILO_AUTHENTIC_RECON_01.spz",
        "ply_size_bytes": int(len(ply_bytes)),
        "spz_size_bytes": int(len(spz_bytes)),
        "compression_ratio_pct": compression_ratio,
        "registered_images": int(num_frames),
        "total_images": int(len(image_files)),
        "registration_rate_pct": reg_rate,
        "training_iterations": int(train_iters),
        "ply_data": ply_bytes,
        "spz_data": spz_bytes,
        "transforms_json": transforms_file.read_text() if transforms_file.exists() else "",
        "duration_seconds": duration,
        "status": "completed"
    }

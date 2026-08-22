"""
Phase 10.7N-R10.2E — Limited Authentic Gaussian Experiment on Modal L4
"""

import os
import sys
import io
import time
import subprocess
import shutil
import json
from pathlib import Path
import modal

from reconstruction_worker.modal.image_setup import reconstruction_image

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
    return len(frames)


@app.function(gpu="L4", timeout=1800)
def run_r10_2e_experiment(images_dict: dict, iterations: int = 2000) -> dict:
    """
    Executes clean COLMAP subset reconstruction -> Splatfacto 3D Gaussian Splatting experiment.
    """
    work_dir = Path("/tmp") / f"r10_2e_exp_{int(time.time())}"
    work_dir.mkdir(parents=True, exist_ok=True)

    img_dir = work_dir / "images"
    img_dir.mkdir(parents=True, exist_ok=True)

    for fname, data in images_dict.items():
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

    t0 = time.time()

    # Step 1: Clean COLMAP on the 15-image subset
    print(f"[1/4] Running clean COLMAP on {len(images_dict)} subset images...")
    subprocess.run([
        "colmap", "feature_extractor",
        "--database_path", str(db_path),
        "--image_path", str(img_dir),
        "--ImageReader.camera_model", "SIMPLE_RADIAL",
        "--ImageReader.single_camera", "1",
        "--SiftExtraction.max_num_features", "10000",
        "--SiftExtraction.use_gpu", "0"
    ], check=True, env=HEADLESS_ENV)

    subprocess.run([
        "colmap", "exhaustive_matcher",
        "--database_path", str(db_path),
        "--SiftMatching.guided_matching", "1",
        "--SiftMatching.use_gpu", "0"
    ], check=True, env=HEADLESS_ENV)

    subprocess.run([
        "colmap", "mapper",
        "--database_path", str(db_path),
        "--image_path", str(img_dir),
        "--output_path", str(sparse_dir)
    ], check=True, env=HEADLESS_ENV)

    sparse_0 = sparse_dir / "0"
    if not sparse_0.exists():
        raise RuntimeError("Subset COLMAP failed to produce sparse model.")

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
    reg_rate = float(round((num_frames / max(len(images_dict), 1)) * 100.0, 1))

    pts_txt = (txt_dir / "points3D.txt").read_text() if (txt_dir / "points3D.txt").exists() else ""
    pt_count = len([l for l in pts_txt.splitlines() if l.strip() and not l.startswith("#")])

    colmap_time = float(round(time.time() - t0, 2))
    print(f"[1/4] Subset COLMAP completed: {num_frames}/{len(images_dict)} ({reg_rate}%), points={pt_count} in {colmap_time}s")

    # Step 2: Splatfacto 3D Gaussian Splatting Training
    train_iters = max(iterations, 1000)
    print(f"[2/4] Running Splatfacto ({train_iters} iterations) on L4 GPU...")
    t_train = time.time()
    cmd_train = [
        "ns-train", "splatfacto",
        "--data", str(ns_data_dir),
        "--output-dir", str(output_dir),
        "--experiment-name", "wilo_part_exp",
        "--max-num-iterations", str(train_iters),
        "--pipeline.model.cull-alpha-thresh", "0.005",
        "--viewer.quit-on-train-completion", "True"
    ]
    subprocess.run(cmd_train, check=True, env=HEADLESS_ENV)
    training_duration = float(round(time.time() - t_train, 2))

    config_files = list(output_dir.glob("**/config.yml"))
    if not config_files:
        raise RuntimeError("Training failed to produce config.yml")
    config_path = config_files[0]

    # Step 3: Export Experiment PLY & SPZ
    print("[3/4] Exporting Gaussian PLY and SPZ...")
    output_ply = export_dir / "WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.ply"
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

    # SPZ compression
    output_spz = export_dir / "WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.spz"
    import gzip
    spz_bytes = gzip.compress(ply_bytes, compresslevel=6) if ply_bytes else b""
    output_spz.write_bytes(spz_bytes)

    # Step 4: Render Multi-View Visual Evaluation Images
    print("[4/4] Rendering Multi-View Evaluation Images...")
    render_dir = work_dir / "renders"
    render_dir.mkdir(parents=True, exist_ok=True)

    rendered_images = {}
    try:
        cmd_render = [
            "ns-render", "dataset",
            "--load-config", str(config_path),
            "--output-path", str(render_dir),
            "--rendered-output-names", "rgb"
        ]
        subprocess.run(cmd_render, check=True, env=HEADLESS_ENV)

        for rimg in sorted(render_dir.glob("**/*.png")):
            rendered_images[rimg.name] = rimg.read_bytes()
    except Exception as e:
        print(f"ns-render warning: {e}")

    total_time = float(round(time.time() - t0, 2))

    # Binary artifacts
    db_bytes = db_path.read_bytes() if db_path.exists() else b""
    cameras_bin = (sparse_0 / "cameras.bin").read_bytes() if (sparse_0 / "cameras.bin").exists() else b""
    images_bin = (sparse_0 / "images.bin").read_bytes() if (sparse_0 / "images.bin").exists() else b""
    points3d_bin = (sparse_0 / "points3D.bin").read_bytes() if (sparse_0 / "points3D.bin").exists() else b""

    return {
        "input_images": int(len(images_dict)),
        "registered_images": int(num_frames),
        "registration_rate": reg_rate,
        "sparse_points": pt_count,
        "colmap_duration_seconds": colmap_time,
        "training_iterations": train_iters,
        "training_duration_seconds": training_duration,
        "total_duration_seconds": total_time,
        "ply_size_bytes": int(len(ply_bytes)),
        "spz_size_bytes": int(len(spz_bytes)),
        "ply_data": ply_bytes,
        "spz_data": spz_bytes,
        "rendered_images": rendered_images,
        "cameras_txt": (txt_dir / "cameras.txt").read_text() if (txt_dir / "cameras.txt").exists() else "",
        "images_txt": (txt_dir / "images.txt").read_text() if (txt_dir / "images.txt").exists() else "",
        "points3D_txt": pts_txt,
        "database_db": db_bytes,
        "cameras_bin": cameras_bin,
        "images_bin": images_bin,
        "points3D_bin": points3d_bin,
        "status": "completed"
    }

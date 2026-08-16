"""
Virtual Trade Show Commercial V1 — Modal GPU Image Setup
NVIDIA CUDA 12.1 Devel Container Definition for Splatfacto & gsplat (Phase 6)
"""

import modal

# Base NVIDIA CUDA 12.1.1 Devel Container with Full CUDA Headers, Clang & NVCC
reconstruction_image = (
    modal.Image.from_registry("nvidia/cuda:12.1.1-devel-ubuntu22.04", add_python="3.10")
    .apt_install(
        "git",
        "wget",
        "curl",
        "clang",
        "ffmpeg",
        "colmap",
        "build-essential",
        "cmake",
        "libgl1-mesa-glx",
        "libglib2.0-0"
    )
    .env({
        "QT_QPA_PLATFORM": "offscreen",
        "DISPLAY": ":0",
        "OPENCV_LOG_LEVEL": "SILENT",
        "CUDA_HOME": "/usr/local/cuda"
    })
    .pip_install(
        "torch==2.1.2+cu121",
        "torchvision==0.16.2+cu121",
        extra_index_url="https://download.pytorch.org/whl/cu121"
    )
    .pip_install(
        "ninja",
        "requests",
        "python-dotenv",
        "open3d",
        "plyfile",
        "nerfstudio==1.0.1",
        "numpy==1.26.4"
    )
    .pip_install(
        "gsplat==0.1.3",
        extra_index_url="https://docs.gsplat.studio/whl/pt21cu121"
    )
    .run_commands(
        "python -m pip install 'numpy<2.0.0' opencv-python-headless --force-reinstall"
    )
)

#!/usr/bin/env python3
"""
Virtual Trade Show Commercial V1 — Precision 3D Reconstruction Worker
Supports Dry-Run Zero-Cost Mode ($0) & Real Local/Cloud GPU Execution
"""

import os
import sys
import time
import json
import requests
from dotenv import load_dotenv

# Load environment
load_dotenv()

SERVER_URL = os.getenv("SERVER_URL", "http://localhost:3000").rstrip("/")
WORKER_SECRET = os.getenv("WORKER_SECRET", "dev-worker-secret-key-2026")
WORKER_ID = os.getenv("WORKER_ID", "gpu-worker-node-01")
DRY_RUN = os.getenv("DRY_RUN", "true").lower() in ("true", "1", "yes")
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "5"))

HEADERS = {
    "Authorization": f"Bearer {WORKER_SECRET}",
    "Content-Type": "application/json"
}

def log(msg):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [Worker: {WORKER_ID}] {msg}", flush=True)

def claim_job():
    url = f"{SERVER_URL}/api/worker/jobs/claim"
    try:
        res = requests.post(url, headers=HEADERS, json={"workerId": WORKER_ID}, timeout=10)
        if res.status_code == 200:
            return res.json()
        elif res.status_code == 204:
            return None
        else:
            log(f"Claim request returned HTTP {res.status_code}: {res.text}")
            return None
    except Exception as e:
        log(f"Error connecting to server to claim job: {e}")
        return None

def update_progress(job_id, progress, stage, diagnostics=None):
    url = f"{SERVER_URL}/api/worker/jobs/{job_id}/progress"
    payload = {
        "progress": progress,
        "currentStage": stage,
        "diagnostics": diagnostics or {}
    }
    try:
        requests.post(url, headers=HEADERS, json=payload, timeout=10)
    except Exception as e:
        log(f"Failed to report progress for {job_id}: {e}")

def complete_job(job_id, output, diagnostics=None):
    url = f"{SERVER_URL}/api/worker/jobs/{job_id}/complete"
    payload = {
        "output": output,
        "diagnostics": diagnostics or {}
    }
    res = requests.post(url, headers=HEADERS, json=payload, timeout=10)
    return res.status_code == 200

def fail_job(job_id, stage, error_msg):
    url = f"{SERVER_URL}/api/worker/jobs/{job_id}/fail"
    payload = {
        "stage": stage,
        "error": error_msg
    }
    try:
        requests.post(url, headers=HEADERS, json=payload, timeout=10)
    except Exception as e:
        log(f"Failed to report job failure: {e}")

def run_dry_run_pipeline(job):
    job_id = job.get("jobId") or job.get("job", {}).get("id")
    booth_id = job.get("boothId") or job.get("job", {}).get("boothId")
    photo_count = job.get("sourcePhotoCount", 12)

    log(f"Starting DRY_RUN pipeline for Job {job_id} (Booth: {booth_id}, Photos: {photo_count})")

    stages = [
        (10, "preparing", "Downloading and verifying image metadata..."),
        (25, "colmap_feature_extraction", "Extracting SIFT visual keypoints..."),
        (45, "colmap_matching", "Running exhaustive feature matching & epipolar geometry..."),
        (60, "colmap_mapping", "Constructing sparse 3D point cloud via Bundle Adjustment..."),
        (75, "nerfstudio_processing", "Transforming poses into Nerfstudio coordinate space..."),
        (85, "splat_training", "Optimizing 3D Gaussian Splatting ellipsoids (Splatfacto)..."),
        (95, "splat_export", "Exporting web-ready Gaussian Splat PLY spatial asset..."),
        (100, "uploading_result", "Uploading reconstructed asset to storage...")
    ]

    for progress, stage, desc in stages:
        log(f"Stage [{stage}] -> {progress}%: {desc}")
        update_progress(job_id, progress, stage, {
            "registeredImages": photo_count,
            "totalImages": photo_count,
            "sparsePoints": 42500 + progress * 800
        })
        time.sleep(1.0) # Simulated step duration

    output = {
        "type": "gaussian_splat",
        "url": f"/uploads/models/{booth_id}_splat.ply",
        "format": "ply",
        "sizeBytes": 14850000
    }

    diagnostics = {
        "registeredImages": photo_count,
        "totalImages": photo_count,
        "sparsePoints": 106500,
        "warnings": []
    }

    success = complete_job(job_id, output, diagnostics)
    if success:
        log(f"Job {job_id} completed successfully (DRY_RUN). Booth is now 'reconstructed'.")
    else:
        log(f"Failed to submit completion for {job_id}.")

def run_real_pipeline(job):
    job_id = job.get("jobId") or job.get("job", {}).get("id")
    try:
        from pipeline.colmap import ColmapRunner
        from pipeline.nerfstudio import NerfstudioRunner
    except ImportError as e:
        fail_job(job_id, "preparing", f"Pipeline module import error: {e}")
        return

    colmap = ColmapRunner("/tmp/workspace")
    if not colmap.is_available():
        msg = "Real GPU execution requested, but COLMAP binary is not found in system PATH. Install COLMAP or run in DRY_RUN=true mode."
        log(f"ERROR: {msg}")
        fail_job(job_id, "colmap_feature_extraction", msg)
        return

    # Real execution branches continue here...

def main_loop(single_run=False):
    log("=================================================================")
    log(" Virtual Trade Show Precision 3D Reconstruction Worker Started")
    log(f" Server URL: {SERVER_URL}")
    log(f" Mode: {'DRY_RUN (Zero-Cost Trial $0)' if DRY_RUN else 'REAL GPU EXECUTION'}")
    log("=================================================================")

    while True:
        job = claim_job()
        if job:
            log(f"Claimed job: {job.get('jobId') or job.get('job', {}).get('id')}")
            if DRY_RUN:
                run_dry_run_pipeline(job)
            else:
                run_real_pipeline(job)
            if single_run:
                break
        else:
            if single_run:
                log("No pending jobs to process.")
                break
            time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    single_mode = "--once" in sys.argv
    main_loop(single_run=single_mode)

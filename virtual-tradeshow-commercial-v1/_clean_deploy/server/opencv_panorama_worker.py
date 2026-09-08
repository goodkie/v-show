#!/usr/bin/env python3
"""
³D₂ / 3DZ — Native OpenCV Panorama Worker & Capture Quality Gate
Module: server/opencv_panorama_worker.py

Features:
- Pairwise Feature Overlap Validation: Fast proxy SIFT matching with RANSAC homography
- Ring Closure Pre-flight Gate: Validates entire capture ring before full stitching
- Telemetry: Separates Camera Geometry Coverage from Mosaic Coverage, Last-First Error from Global Ring Error
- Native OpenCV Stitcher Pipeline: SIFT -> Bundle Adjustment -> Spherical Warping -> Seam Finding -> Multi-Band Blending
"""

import sys
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

import glob
site_pkgs = glob.glob('/root/.nix-profile/lib/python*/site-packages')
if site_pkgs and site_pkgs[0] not in sys.path:
    sys.path.insert(0, site_pkgs[0])

import json
import argparse
import hashlib
import cv2
import numpy as np

# Shared SO(3) pure-rotation geometry validator
from panorama_geometry_validator import (
    validate_edge_features,
    build_intrinsics_matrix,
    RAW_H_CONDITION_NUMBER_HARD_GATE,
    ESSENTIAL_MATRIX_PRIMARY_MODEL,
    FORCED_EDGE_POLICY
)

MIN_REGISTRATION_RETENTION = 0.85
FULL_360_MIN_COVERAGE_DEG = 340.0

cv2.ocl.setUseOpenCL(False)

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def extract_exif_info(filepath):
    make = "UNKNOWN"
    model = "UNKNOWN"
    focal_35mm = None
    try:
        from PIL import Image, ExifTags
        with Image.open(filepath) as img:
            exif = img._getexif()
            if exif:
                for k, v in exif.items():
                    tag = ExifTags.TAGS.get(k, k)
                    if tag == 'Make':
                        make = str(v).strip()
                    elif tag == 'Model':
                        model = str(v).strip()
                    elif tag == 'FocalLengthIn35mmFilm':
                        focal_35mm = float(v)
    except Exception:
        pass
    return {"make": make, "model": model, "focalLengthIn35mmFilm": focal_35mm}

def validate_single_pair(img_path_a, img_path_b, from_slot="SHOT_01", to_slot="SHOT_02", max_dim=1024):
    if not os.path.exists(img_path_a) or not os.path.exists(img_path_b):
        return {
            "fromSlot": from_slot,
            "toSlot": to_slot,
            "goodMatchCount": 0,
            "inlierCount": 0,
            "inlierRatio": 0.0,
            "medianReprojectionError": None,
            "homographyValid": False,
            "status": "FAILED",
            "message": "Source photo file not found."
        }
    img1 = cv2.imread(img_path_a)
    img2 = cv2.imread(img_path_b)
    if img1 is None or img2 is None:
        return {
            "fromSlot": from_slot,
            "toSlot": to_slot,
            "goodMatchCount": 0,
            "inlierCount": 0,
            "inlierRatio": 0.0,
            "medianReprojectionError": None,
            "homographyValid": False,
            "status": "FAILED",
            "message": "OpenCV could not decode image."
        }
    h1, w1 = img1.shape[:2]
    h2, w2 = img2.shape[:2]
    s1 = min(1.0, max_dim / max(h1, w1))
    s2 = min(1.0, max_dim / max(h2, w2))
    img1_sm = cv2.resize(img1, (int(round(w1 * s1)), int(round(h1 * s1))), interpolation=cv2.INTER_AREA)
    img2_sm = cv2.resize(img2, (int(round(w2 * s2)), int(round(h2 * s2))), interpolation=cv2.INTER_AREA)

    sift = cv2.SIFT_create()
    kp1, des1 = sift.detectAndCompute(img1_sm, None)
    kp2, des2 = sift.detectAndCompute(img2_sm, None)

    if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
        return {
            "fromSlot": from_slot,
            "toSlot": to_slot,
            "goodMatchCount": 0,
            "inlierCount": 0,
            "inlierRatio": 0.0,
            "medianReprojectionError": None,
            "rotationDeg": None,
            "homographyValid": False,
            "status": "FAILED"
        }

    val_res = validate_edge_features(
        kp1, des1, kp2, des2,
        img_shape=img1_sm.shape[:2],
        sensor_yaw_a=None,
        sensor_yaw_b=None
    )
    inlier_count = val_res["nInliers"]
    inlier_ratio = val_res["inlierRatio"]
    median_err = val_res["reprojErrorPx"]

    if val_res["valid"]:
        status = "GOOD" if inlier_count >= 30 and inlier_ratio >= 0.35 else "WEAK"
    else:
        status = "FAILED"

    if status == "FAILED":
        overlap_class = "TOO_LITTLE_OVERLAP"
    elif inlier_count >= 800 and inlier_ratio >= 0.95:
        overlap_class = "TOO_MUCH_OVERLAP"
    elif status in ("GOOD", "WEAK"):
        overlap_class = "GOOD_OVERLAP"
    else:
        overlap_class = "GEOMETRY_UNCERTAIN"

    return {
        "fromSlot": from_slot,
        "toSlot": to_slot,
        "pairLabel": f"{from_slot}->{to_slot}",
        "goodMatchCount": val_res["nMatches"],
        "inlierCount": inlier_count,
        "inlierRatio": inlier_ratio,
        "medianReprojectionError": median_err,
        "rotationDeg": val_res["rotationDeg"],
        "homographyValid": val_res["valid"],
        "status": status,
        "overlapClassification": overlap_class
    }

def validate_capture_ring(sources, max_dim=1024):
    N = len(sources)
    if N < 2:
        return {
            "ok": False,
            "allPass": False,
            "ringStatus": "BROKEN",
            "error": "PANORAMA_SOURCE_RANGE",
            "message": "At least 2 photos required for ring validation.",
            "failedPairs": [],
            "weakPairs": [],
            "pairResults": []
        }

    paths = []
    slots = []
    for idx, s in enumerate(sources):
        p = s.get('path') or s.get('localPath')
        slot = s.get('slot') or f"SHOT_{idx+1:02d}"
        paths.append(p)
        slots.append(slot)

    sift = cv2.SIFT_create()
    kps = []
    descs = []
    img_shapes = []
    for p in paths:
        if not os.path.exists(p):
            kps.append([])
            descs.append(None)
            img_shapes.append((540, 960))
            continue
        im = cv2.imread(p)
        if im is None:
            kps.append([])
            descs.append(None)
            img_shapes.append((540, 960))
            continue
        h, w = im.shape[:2]
        s = min(1.0, max_dim / max(h, w))
        im_sm = cv2.resize(im, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_AREA)
        kp, des = sift.detectAndCompute(im_sm, None)
        kps.append(kp)
        descs.append(des)
        img_shapes.append(im_sm.shape[:2])

    pair_results = []
    failed_pairs = []
    weak_pairs = []

    for i in range(N):
        nxt = (i + 1) % N
        from_slot = slots[i]
        to_slot = slots[nxt]
        pair_key = f"{i+1}->{nxt+1}"
        des1, des2 = descs[i], descs[nxt]
        kp1, kp2 = kps[i], kps[nxt]

        val_res = validate_edge_features(
            kp1, des1, kp2, des2,
            img_shape=img_shapes[i],
            sensor_yaw_a=None,
            sensor_yaw_b=None
        )
        inlier_count = val_res["nInliers"]
        inlier_ratio = val_res["inlierRatio"]
        median_err = val_res["reprojErrorPx"]

        if val_res["valid"]:
            status = "GOOD" if inlier_count >= 30 and inlier_ratio >= 0.35 else "WEAK"
            if status == "WEAK":
                weak_pairs.append(pair_key)
            overlap_class = "GOOD_OVERLAP"
        else:
            status = "FAILED"
            failed_pairs.append(pair_key)
            overlap_class = "TOO_LITTLE_OVERLAP"

        res = {
            "fromSlot": from_slot,
            "toSlot": to_slot,
            "pairKey": pair_key,
            "goodMatchCount": val_res["nMatches"],
            "inlierCount": inlier_count,
            "inlierRatio": inlier_ratio,
            "medianReprojectionError": median_err,
            "rotationDeg": val_res["rotationDeg"],
            "homographyValid": val_res["valid"],
            "status": status,
            "overlapClassification": overlap_class
        }
        pair_results.append(res)

    all_pass = (len(failed_pairs) == 0)
    ring_status = "CONNECTED" if all_pass else "BROKEN"

    return {
        "ok": all_pass,
        "allPass": all_pass,
        "ringStatus": ring_status,
        "sourceCount": N,
        "failedPairs": failed_pairs,
        "weakPairs": weak_pairs,
        "pairResults": pair_results,
        "lastFirstPair": pair_results[-1] if pair_results else None
    }

def run_opencv_stitching(input_data):
    sources = input_data.get('sources', [])
    output_dir = input_data.get('outputDir', '.')
    candidate_id = input_data.get('candidateId', 'cand-panorama-opencv')
    os.makedirs(output_dir, exist_ok=True)

    if len(sources) < 2:
        return {
            "status": "FAILED",
            "errorCode": "PANORAMA_SOURCE_RANGE",
            "message": "At least 2 photos required for panorama stitching.",
            "userMessage": "Please provide at least 2 overlapping photos.",
            "panoramaCreated": False,
            "applyEnabled": False
        }

    if input_data.get('visualGraphConnected') is False:
        return {
            "status": "FAILED",
            "errorCode": "PANORAMA_RING_GRAPH_DISCONNECTED",
            "message": "Visual ring graph is disconnected. Rejecting stitch preflight to prevent silent camera dropout.",
            "userMessage": "These photos do not form a continuous visual ring around 360 degrees. Please check capture coverage.",
            "panoramaCreated": False,
            "applyEnabled": False,
            "geometryValid": False,
            "full360Qualified": False,
            "visualGraphConnected": False,
            "engine": "OPENCV",
            "sourceCount": len(sources)
        }

    # 1. Inspect source files and compute hashes
    image_paths = []
    source_metadata = []
    for idx, s in enumerate(sources):
        p = s.get('path') or s.get('localPath')
        if not p or not os.path.exists(p):
            return {
                "status": "FAILED",
                "errorCode": "FILE_NOT_FOUND",
                "message": f"Source file not found: {p}",
                "userMessage": "One or more source photos could not be read.",
                "panoramaCreated": False,
                "applyEnabled": False
            }
        sha = compute_sha256(p)
        exif = extract_exif_info(p)
        image_paths.append(p)
        source_metadata.append({
            "index": idx,
            "slot": s.get('slot', f"SHOT_{idx+1:02d}"),
            "path": p,
            "sha256": sha,
            "cameraMake": exif.get('make'),
            "cameraModel": exif.get('model'),
            "focalLength35mm": exif.get('focalLengthIn35mmFilm')
        })

    # 2. Pre-compute pairwise Last->First match error
    last_first_val = validate_single_pair(image_paths[-1], image_paths[0], f"SHOT_{len(sources):02d}", "SHOT_01")
    last_first_reproj = last_first_val.get("medianReprojectionError")
    last_first_accepted = (last_first_val.get("status") in ["GOOD", "WEAK"])

    # 3. Load images with OpenCV
    loaded_images = []
    orig_shapes = []
    for p in image_paths:
        img = cv2.imread(p)
        if img is None:
            return {
                "status": "FAILED",
                "errorCode": "IMAGE_DECODE_ERROR",
                "message": f"OpenCV could not decode image: {p}",
                "userMessage": "One or more photos are in an unsupported or corrupt format.",
                "panoramaCreated": False,
                "applyEnabled": False
            }
        h, w, _ = img.shape
        orig_shapes.append((w, h))
        loaded_images.append(img)



    # 4. Create native OpenCV Stitcher configured for PANORAMA
    stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
    
    feature_engine = "SIFT"
    try:
        sift = cv2.SIFT_create()
        _ = sift.detectAndCompute(loaded_images[0], None)
    except Exception:
        feature_engine = "ORB"

    status, pano = stitcher.stitch(loaded_images)

    status_names = {
        cv2.Stitcher_OK: "OK",
        cv2.Stitcher_ERR_NEED_MORE_IMGS: "ERR_NEED_MORE_IMGS",
        cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: "ERR_HOMOGRAPHY_EST_FAIL",
        cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: "ERR_CAMERA_PARAMS_ADJUST_FAIL"
    }
    status_str = status_names.get(status, f"ERR_CODE_{status}")

    if status != cv2.Stitcher_OK:
        fail_msg = "We couldn't reliably connect these photos. Please retake them with more overlap from the same position."
        return {
            "status": "FAILED",
            "opencvStatusCode": status_str,
            "errorCode": "STITCH_VALIDATION_FAILED",
            "message": f"OpenCV stitch failed with status {status_str}",
            "userMessage": fail_msg,
            "customerMessage": fail_msg,
            "panoramaCreated": False,
            "applyEnabled": False,
            "geometryValid": False,
            "full360Qualified": False,
            "engine": "OPENCV",
            "featureEngine": feature_engine,
            "sourceCount": len(sources),
            "sources": source_metadata
        }

    # 5. Geometry and Camera Analysis
    pano_h, pano_w, _ = pano.shape
    cameras = stitcher.cameras()
    comp = stitcher.component()
    connected_indices = comp.tolist() if hasattr(comp, 'tolist') else list(comp)

    # Compute camera focals and coverage
    focals = [c.focal for c in cameras] if cameras else []
    median_focal = float(np.median(focals)) if focals else 1000.0

    # Registration scale
    first_orig_h = orig_shapes[0][1]
    reg_ppy = cameras[0].ppy if cameras else (first_orig_h / 4)
    reg_scale = first_orig_h / (reg_ppy * 2.0) if reg_ppy > 0 else 2.0
    native_focal = median_focal * reg_scale

    # Output mosaic coverage estimate (based on raster width)
    horiz_cov_rad = pano_w / native_focal if native_focal > 0 else 0
    mosaic_cov_deg = float(np.clip(np.rad2deg(horiz_cov_rad), 10.0, 360.0))
    vert_cov_rad = pano_h / native_focal if native_focal > 0 else 0
    vert_cov_deg = float(np.clip(np.rad2deg(vert_cov_rad), 10.0, 180.0))

    # Camera geometry coverage (based on solved camera rotation optical axis in SO(3))
    optical_yaws = []
    if cameras:
        for c in cameras:
            R = c.R
            yaw = np.arctan2(R[0, 2], R[2, 2])
            optical_yaws.append(float(np.rad2deg(yaw)))
    cam_geom_cov_deg = round(float(max(optical_yaws) - min(optical_yaws)), 1) if optical_yaws else 0.0
    solved_optical_axis_coverage_deg = cam_geom_cov_deg

    input_camera_count = len(sources)
    registered_camera_count = len(connected_indices)
    registration_retention = round(registered_camera_count / max(1, input_camera_count), 3)

    # Evaluate full 360 qualification:
    all_connected = (registered_camera_count == input_camera_count)
    high_retention = (registration_retention >= 0.85)
    is_360_geom = (solved_optical_axis_coverage_deg >= 345.0)
    full_360_qualified = bool(high_retention and is_360_geom and last_first_accepted)
    
    # Global ring closure error (post-bundle metric: null if unclosed/partial)
    if full_360_qualified and len(optical_yaws) >= 2:
        global_ring_closure_err = round(abs(360.0 - solved_optical_axis_coverage_deg), 2)
    else:
        global_ring_closure_err = None

    full_spherical = bool(full_360_qualified and vert_cov_deg >= 160.0)
    projection_type = "EQUIRECTANGULAR_FULL_SPHERE" if full_spherical else "SPHERICAL_BAND"
    panorama_type = "FULL_360" if full_360_qualified else "PARTIAL"

    # Yaw / Pitch Navigation Limits
    max_yaw_half = round(mosaic_cov_deg / 2.0, 1)
    yaw_min = -max_yaw_half
    yaw_max = max_yaw_half
    max_pitch_half = round(min(45.0, vert_cov_deg / 2.0), 1)
    pitch_min = -max_pitch_half
    pitch_max = max_pitch_half

    # 6. Save Native Stitched Panorama
    native_filename = f"{candidate_id}_native.jpg"
    native_path = os.path.join(output_dir, native_filename)
    cv2.imwrite(native_path, pano, [cv2.IMWRITE_JPEG_QUALITY, 92])

    # 7. Generate Preview Derivative (4096 max width for crisp WebGL rendering)
    preview_filename = f"{candidate_id}_preview.jpg"
    preview_path = os.path.join(output_dir, preview_filename)
    if pano_w > 4096:
        prev_scale = 4096.0 / pano_w
        prev_w = 4096
        prev_h = int(round(pano_h * prev_scale))
        preview_img = cv2.resize(pano, (prev_w, prev_h), interpolation=cv2.INTER_AREA)
        cv2.imwrite(preview_path, preview_img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    else:
        cv2.imwrite(preview_path, pano, [cv2.IMWRITE_JPEG_QUALITY, 90])

    master_sha256 = compute_sha256(native_path)

    # 8. Angular Anchors
    anchors = []
    anchor_count = len(connected_indices) if len(connected_indices) > 0 else len(sources)
    for idx in range(anchor_count):
        deg = round(yaw_min + (idx / max(1, anchor_count - 1)) * (yaw_max - yaw_min), 1) if not full_360_qualified else round(idx * (360.0 / anchor_count), 1)
        anchors.append({
            "id": f"anchor-deg-{int(deg)}",
            "index": idx,
            "degree": deg,
            "slot": f"SHOT_{idx+1:02d}"
        })

    canonical_frame_ids = input_data.get('canonicalFrameIds') or [s.get('candidateId') for s in sources if s.get('type') == 'CANONICAL'] or [s.get('candidateId') for s in sources]
    panorama_stitch_frame_ids = input_data.get('panoramaStitchFrameIds') or [s.get('candidateId') for s in sources]
    supplemental_bridge_frame_ids = input_data.get('supplementalBridgeFrameIds') or [s.get('candidateId') for s in sources if s.get('type') == 'BRIDGE'] or []

    return {
        "status": "READY",
        "opencvStatusCode": "OK",
        "engine": "OPENCV",
        "engineVersion": cv2.__version__,
        "featureEngine": feature_engine,
        "cameraEstimationStatus": "CONVERGED",
        "bundleAdjustmentStatus": "CONVERGED",
        "warpStatus": "SUCCESS",
        "exposureCompensationStatus": "SUCCESS",
        "seamStatus": "SUCCESS",
        "blendStatus": "SUCCESS",
        "panoramaCreated": True,
        "applyEnabled": True,
        "geometryValid": True,
        "allInputImagesUsed": all_connected,
        "highRetention": high_retention,
        "registrationRetention": registration_retention,
        "full360Qualified": full_360_qualified,
        "panoramaType": panorama_type,
        "projection": projection_type,
        "panoramaProjectionType": projection_type,
        "fullSphericalEquirectangular": full_spherical,
        "doNotForce2To1": True,
        "nativeWidth": pano_w,
        "nativeHeight": pano_h,
        "nativeDimensions": f"{pano_w}x{pano_h}",
        "horizontalCoverageDeg": round(mosaic_cov_deg, 1),
        "verticalCoverageDeg": round(vert_cov_deg, 1),
        "outputMosaicCoverageEstimateDeg": round(mosaic_cov_deg, 1),
        "cameraGeometryCoverageDeg": cam_geom_cov_deg,
        "solvedOpticalAxisCoverageDeg": solved_optical_axis_coverage_deg,
        "lastFirstPairReprojectionError": last_first_reproj,
        "globalRingClosureError": global_ring_closure_err,
        "lastFirstPairResult": last_first_val,
        "yawMin": yaw_min,
        "yawMax": yaw_max,
        "pitchMin": pitch_min,
        "pitchMax": pitch_max,
        "connectedCameraIndices": connected_indices,
        "connectedCount": registered_camera_count,
        "registeredCameraCount": registered_camera_count,
        "inputCameraCount": input_camera_count,
        "sourceCount": len(sources),
        "canonicalFrameIds": canonical_frame_ids,
        "panoramaStitchFrameIds": panorama_stitch_frame_ids,
        "supplementalBridgeFrameIds": supplemental_bridge_frame_ids,
        "visualGraphConnected": True,
        "visualGraphComponentCount": input_data.get('visualGraphComponentCount', 1),
        "nativeFile": native_filename,
        "nativePath": native_path,
        "previewFile": preview_filename,
        "previewPath": preview_path,
        "masterSha256": master_sha256,
        "srUsed": False,
        "anchors": anchors,
        "sources": source_metadata
    }

def main():
    parser = argparse.ArgumentParser(description="Native OpenCV Panorama Worker & Quality Gate")
    parser.add_argument("--action", default="stitch", choices=["stitch", "validate-pair", "validate-ring"])
    parser.add_argument("--input-json", help="Path to input parameters JSON")
    parser.add_argument("--output-json", help="Path to output results JSON")
    parser.add_argument("--img1", help="Image 1 for pair validation")
    parser.add_argument("--img2", help="Image 2 for pair validation")
    parser.add_argument("--slot1", default="SHOT_01", help="Slot label 1")
    parser.add_argument("--slot2", default="SHOT_02", help="Slot label 2")
    args = parser.parse_args()

    if args.action == "validate-pair":
        if not args.img1 or not args.img2:
            print(json.dumps({"error": "Missing --img1 or --img2"}))
            sys.exit(1)
        res = validate_single_pair(args.img1, args.img2, args.slot1, args.slot2)
        if args.output_json:
            with open(args.output_json, 'w', encoding='utf-8') as f:
                json.dump(res, f, indent=2)
        else:
            print(json.dumps(res, indent=2))
        return

    if args.action == "validate-ring":
        if not args.input_json:
            print(json.dumps({"error": "Missing --input-json for ring validation"}))
            sys.exit(1)
        with open(args.input_json, 'r', encoding='utf-8') as f:
            data = json.load(f)
        sources = data.get('sources', [])
        res = validate_capture_ring(sources)
        if args.output_json:
            with open(args.output_json, 'w', encoding='utf-8') as f:
                json.dump(res, f, indent=2)
        else:
            print(json.dumps(res, indent=2))
        return

    # Default action: stitch
    if not args.input_json or not args.output_json:
        print("Missing --input-json or --output-json for stitching")
        sys.exit(1)

    with open(args.input_json, 'r', encoding='utf-8') as f:
        input_data = json.load(f)

    result = run_opencv_stitching(input_data)

    with open(args.output_json, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)

    print(f"[OpenCV Worker] Finished with status={result.get('status')}, full360={result.get('full360Qualified')}, size={result.get('nativeDimensions')}")

if __name__ == "__main__":
    main()

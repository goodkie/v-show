#!/usr/bin/env python3
"""
3D2 / 3DZ Virtual Tradeshow - Shared Pure-Rotation SO(3) Geometry Validator
Module: panorama_geometry_validator.py
Production Version: 3D2-C12.9-P2R10

Authoritative Invariants:
- RAW_H_CONDITION_NUMBER_HARD_GATE = False
- ESSENTIAL_MATRIX_PRIMARY_MODEL = False
- FORCED_EDGE_POLICY = False
"""

import os
import math
import cv2
import numpy as np

# Authoritative Policy Constants
RAW_H_CONDITION_NUMBER_HARD_GATE = False
ESSENTIAL_MATRIX_PRIMARY_MODEL = False
FORCED_EDGE_POLICY = False

# Calibrated geometric thresholds (empirically derived from LLST42 valid edge distribution: P95=1.794px, MAX=1.86px)
MIN_INLIER_COUNT = 15
MIN_INLIER_RATIO = 0.18
MIN_SPATIAL_CELLS = 4
MAX_PURE_ROT_REPROJ_PX = 3.50
MAX_SENSOR_VISUAL_YAW_DISAGREEMENT_DEG = 35.0

DEFAULT_HFOV_DEG = 69.0

def build_intrinsics_matrix(width=1920, height=1080, hfov_deg=DEFAULT_HFOV_DEG, focal_px=None):
    """Construct camera intrinsic calibration matrix K."""
    if focal_px is not None and focal_px > 0:
        fx = fy = float(focal_px)
    else:
        fx = fy = (width / 2.0) / math.tan(math.radians(hfov_deg / 2.0))
    cx = width / 2.0
    cy = height / 2.0
    K = np.array([
        [fx,  0.0, cx],
        [0.0, fy,  cy],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)
    return K

def extract_so3_rotation(H, K):
    """
    Extract pure rotation R in SO(3) from homography H = K R K^-1 via SVD.
    Enforces det(R) = +1 and orthogonality.
    """
    if H is None or K is None:
        return None, 999.0, 999.0
    
    K_inv = np.linalg.inv(K)
    R_raw = K_inv @ H @ K
    
    U, S, Vt = np.linalg.svd(R_raw)
    R = U @ Vt
    if np.linalg.det(R) < 0:
        U_fixed = U.copy()
        U_fixed[:, 2] *= -1.0
        R = U_fixed @ Vt
    
    orth_err = float(np.linalg.norm(R @ R.T - np.eye(3)))
    det_R = float(np.linalg.det(R))
    
    trace_val = (np.trace(R) - 1.0) / 2.0
    trace_val = max(-1.0, min(1.0, float(trace_val)))
    angle_rad = math.acos(trace_val)
    angle_deg = math.degrees(angle_rad)
    
    return R, angle_deg, orth_err

def compute_spatial_distribution(pts, width, height, grid_cols=3, grid_rows=3):
    """Count number of active spatial grid cells containing keypoints."""
    if len(pts) == 0:
        return 0
    cols = np.clip((pts[:, 0] / max(1.0, width) * grid_cols).astype(int), 0, grid_cols - 1)
    rows = np.clip((pts[:, 1] / max(1.0, height) * grid_rows).astype(int), 0, grid_rows - 1)
    cell_indices = rows * grid_cols + cols
    return int(len(np.unique(cell_indices)))

def validate_edge_features(kp1, des1, kp2, des2, img_shape=(1080, 1920), 
                           sensor_yaw_a=None, sensor_yaw_b=None, K=None):
    """
    Validate geometric consistency between two images using SIFT features and SO(3) rotation extraction.
    Returns dictionary with validation metrics and boolean pass/fail status.
    """
    h, w = img_shape[:2]
    if K is None:
        K = build_intrinsics_matrix(width=w, height=h)
        
    result = {
        "valid": False,
        "firstFailedGate": None,
        "nMatches": 0,
        "nInliers": 0,
        "inlierRatio": 0.0,
        "spatialCells": 0,
        "reprojErrorPx": 999.0,
        "rotationDeg": None,
        "orthogonalityError": None,
        "sensorDeltaDeg": None,
        "homography": None,
        "R": None
    }
    
    if sensor_yaw_a is not None and sensor_yaw_b is not None:
        sensor_delta = abs((float(sensor_yaw_b) - float(sensor_yaw_a) + 180.0) % 360.0 - 180.0)
        result["sensorDeltaDeg"] = round(sensor_delta, 2)
    else:
        sensor_delta = None

    if des1 is None or des2 is None or len(kp1) < MIN_INLIER_COUNT or len(kp2) < MIN_INLIER_COUNT:
        result["firstFailedGate"] = "INSUFFICIENT_FEATURES"
        return result

    bf = cv2.BFMatcher(cv2.NORM_L2)
    try:
        raw_matches = bf.knnMatch(des1, des2, k=2)
    except Exception as e:
        result["firstFailedGate"] = f"MATCH_ERROR_{str(e)}"
        return result

    good = []
    for m_tuple in raw_matches:
        if len(m_tuple) == 2:
            m, n = m_tuple
            if m.distance < 0.75 * n.distance:
                good.append(m)

    result["nMatches"] = len(good)
    if len(good) < MIN_INLIER_COUNT:
        result["firstFailedGate"] = "TOO_FEW_MATCHES"
        return result

    src_pts = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 4.0)
    if H is None or mask is None:
        result["firstFailedGate"] = "HOMOGRAPHY_ESTIMATION_FAILED"
        return result

    inliers_mask = mask.ravel() == 1
    inlier_count = int(np.sum(inliers_mask))
    inlier_ratio = float(inlier_count) / max(1, len(good))
    
    result["nInliers"] = inlier_count
    result["inlierRatio"] = round(inlier_ratio, 4)
    result["homography"] = H.tolist()

    # Gate 1: Inlier count
    if inlier_count < MIN_INLIER_COUNT:
        result["firstFailedGate"] = "TOO_FEW_INLIERS"
        return result

    # Gate 2: Inlier ratio
    if inlier_ratio < MIN_INLIER_RATIO:
        result["firstFailedGate"] = "LOW_INLIER_RATIO"
        return result

    inlier_src = src_pts[inliers_mask].reshape(-1, 2)
    inlier_dst = dst_pts[inliers_mask].reshape(-1, 2)

    # Gate 3: Spatial distribution
    spatial_cells = compute_spatial_distribution(inlier_src, w, h)
    result["spatialCells"] = spatial_cells
    if spatial_cells < MIN_SPATIAL_CELLS:
        result["firstFailedGate"] = "INSUFFICIENT_SPATIAL_SUPPORT"
        return result

    # Gate 4: SO(3) Rotation Extraction
    R, rot_deg, orth_err = extract_so3_rotation(H, K)
    result["rotationDeg"] = round(rot_deg, 2) if rot_deg is not None else None
    result["orthogonalityError"] = round(orth_err, 6) if orth_err is not None else None
    if R is not None:
        result["R"] = R.tolist()

    # Gate 4b: Optical Visibility Gate — Rotation cannot exceed horizontal FOV (zero overlap possible above 65°)
    if rot_deg is not None and rot_deg > 65.0:
        result["firstFailedGate"] = "ROTATION_EXCEEDS_FOV_OVERLAP"
        return result

    # Gate 5: Reprojection error under estimated homography
    proj = cv2.perspectiveTransform(inlier_src.reshape(-1, 1, 2), H).reshape(-1, 2)
    errors = np.linalg.norm(inlier_dst - proj, axis=1)
    median_reproj = float(np.median(errors))
    result["reprojErrorPx"] = round(median_reproj, 2)
    
    if median_reproj > MAX_PURE_ROT_REPROJ_PX:
        result["firstFailedGate"] = "PURE_ROT_REPROJ_FAIL"
        return result

    # Gate 6: Sensor-vs-Visual Plausibility (Rejects repetitive-structure false matches across circle)
    if sensor_delta is not None and rot_deg is not None:
        yaw_disagreement = abs(rot_deg - sensor_delta)
        yaw_disagreement = abs((yaw_disagreement + 180.0) % 360.0 - 180.0)
        result["sensorYawDisagreementDeg"] = round(yaw_disagreement, 2)
        if yaw_disagreement > MAX_SENSOR_VISUAL_YAW_DISAGREEMENT_DEG:
            result["firstFailedGate"] = "ROTATION_IMPLAUSIBLE"
            return result

    # Passed all gates
    result["valid"] = True
    result["firstFailedGate"] = None
    return result

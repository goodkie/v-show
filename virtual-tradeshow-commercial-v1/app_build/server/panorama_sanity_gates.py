"""
3D2 / 3DZ — Panorama Visual Sanity Gates
Module: server/panorama_sanity_gates.py

Catastrophic visual sanity verification run BEFORE H_BEND / seam aggregate acceptance.
A panorama failing any catastrophic sanity gate is hard-rejected immediately.
"""

from __future__ import annotations
import math
import numpy as np
import cv2


def decompose_r_to_ypr(R: np.ndarray) -> tuple[float, float, float]:
    """Decompose rotation matrix into yaw, pitch, roll in degrees."""
    R_c = R.T
    yaw = np.degrees(np.arctan2(R_c[0, 2], R_c[2, 2]))
    pitch = np.degrees(np.arcsin(-np.clip(R_c[1, 2], -1.0, 1.0)))
    roll = np.degrees(np.arctan2(R_c[1, 0], R_c[1, 1]))
    return float(yaw), float(pitch), float(roll)


def evaluate_pixel_occupancy(image: np.ndarray) -> dict:
    """Measure valid physical-image occupancy over the expected panorama band."""
    h, w = image.shape[:2]
    total_pixels = h * w
    if total_pixels == 0:
        return {
            "VALID_PIXEL_OCCUPANCY_RATIO": 0.0,
            "LARGEST_INVALID_INTERIOR_REGION_RATIO": 1.0,
            "VALID_MASK_COMPONENT_COUNT": 0,
            "occupancyPass": False,
            "interiorVoidPass": False,
            "connectedMaskPass": False
        }

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    valid_mask = (gray > 5).astype(np.uint8)
    occupancy_ratio = float(np.sum(valid_mask)) / float(total_pixels)

    # Connected components of valid pixels
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(valid_mask, connectivity=8)
    # Background is label 0. Valid components have labels 1..num_labels-1
    # Filter out tiny noise components (< 500 px)
    sig_components = [i for i in range(1, num_labels) if stats[i, cv2.CC_STAT_AREA] > 500]
    valid_mask_component_count = len(sig_components)

    # Detect interior holes/voids inside the valid mask
    # A void is background (0) that cannot reach the image outer border
    # Flood-fill from borders on inverted mask (where 1 is black/void)
    inv_mask = (valid_mask == 0).astype(np.uint8)
    h_pad, w_pad = h + 2, w + 2
    flood_canvas = np.ones((h_pad, w_pad), dtype=np.uint8)
    flood_canvas[1:h+1, 1:w+1] = inv_mask

    mask_for_flood = np.zeros((h_pad + 2, w_pad + 2), dtype=np.uint8)
    # Flood-fill from top-left (0,0)
    cv2.floodFill(flood_canvas, mask_for_flood, (0, 0), 2)
    # Unreached regions that are 1 are interior voids!
    interior_voids = (flood_canvas[1:h+1, 1:w+1] == 1).astype(np.uint8)
    num_void_labels, void_labels, void_stats, _ = cv2.connectedComponentsWithStats(interior_voids, connectivity=8)
    largest_void_area = 0
    for i in range(1, num_void_labels):
        area = void_stats[i, cv2.CC_STAT_AREA]
        if area > largest_void_area:
            largest_void_area = area

    largest_invalid_interior_region_ratio = float(largest_void_area) / float(total_pixels)

    # Thresholds:
    # 1. Occupancy: At least 70% of the bounding canvas must be occupied by physical scene
    occupancy_pass = occupancy_ratio >= 0.70
    # 2. Interior void: No interior hole larger than 0.5% of total canvas
    interior_void_pass = largest_invalid_interior_region_ratio <= 0.005
    # 3. Exactly 1 connected physical band (no detached fragments/islands)
    connected_mask_pass = (valid_mask_component_count == 1)

    return {
        "VALID_PIXEL_OCCUPANCY_RATIO": round(occupancy_ratio, 4),
        "LARGEST_INVALID_INTERIOR_REGION_RATIO": round(largest_invalid_interior_region_ratio, 6),
        "VALID_MASK_COMPONENT_COUNT": valid_mask_component_count,
        "occupancyPass": occupancy_pass,
        "interiorVoidPass": interior_void_pass,
        "connectedMaskPass": connected_mask_pass
    }


def evaluate_orientation_sanity(cameras: list[dict | object]) -> dict:
    """
    Audit camera orientations for:
    - implausible roll
    - optical-axis foldback
    - non-monotonic ring traversal
    - camera inversion
    - neighboring-frame orientation discontinuity
    """
    if not cameras or len(cameras) < 2:
        return {
            "orientationPass": False,
            "failedOrientationChecks": ["INSUFFICIENT_CAMERAS"],
            "metrics": {}
        }

    yaws, pitches, rolls = [], [], []
    optical_axes = []

    for c in cameras:
        if isinstance(c, dict):
            R = c.get('R')
            y = c.get('yaw')
            p = c.get('pitch')
            r = c.get('roll')
        else:
            R = getattr(c, 'R', None)
            y = getattr(c, 'yaw', None)
            p = getattr(c, 'pitch', None)
            r = getattr(c, 'roll', None)

        if R is not None:
            R_mat = np.array(R, dtype=np.float64)
            if R_mat.shape == (3, 3):
                y_calc, p_calc, r_calc = decompose_r_to_ypr(R_mat)
                y = y_calc if y is None else y
                p = p_calc if p is None else p
                r = r_calc if r is None else r
                # Optical axis in world coordinates: R^T * [0, 0, 1]^T
                opt_axis = R_mat.T @ np.array([0.0, 0.0, 1.0])
                optical_axes.append(opt_axis / np.linalg.norm(opt_axis))

        yaws.append(float(y or 0.0))
        pitches.append(float(p or 0.0))
        rolls.append(float(r or 0.0))

    N = len(cameras)
    failed_checks = []

    # 1. Roll check: implausible roll
    max_abs_roll = float(np.max(np.abs(rolls)))
    roll_std = float(np.std(rolls))
    if max_abs_roll > 25.0:
        failed_checks.append("EXCESSIVE_MAX_ROLL")
    if roll_std > 12.0:
        failed_checks.append("EXCESSIVE_ROLL_VARIATION")

    # 2. Pitch check: camera inversion (looking at ceiling/floor or upside down)
    max_abs_pitch = float(np.max(np.abs(pitches)))
    if max_abs_pitch > 45.0:
        failed_checks.append("CAMERA_INVERSION_OR_TILT")

    # 3. Optical axis foldback
    min_dot = 1.0
    if len(optical_axes) == N:
        for i in range(N):
            nxt = (i + 1) % N
            dot_val = float(np.dot(optical_axes[i], optical_axes[nxt]))
            if dot_val < min_dot:
                min_dot = dot_val
        # Adjacent cameras in a 36-frame ring are ~10 deg apart (dot ~ 0.98).
        # Any dot < 0.60 indicates a severe geometric foldback.
        if min_dot < 0.60:
            failed_checks.append("OPTICAL_AXIS_FOLDBACK")

    # 4. Ring monotonicity and neighbor step check
    yaw_steps = []
    for i in range(N - 1):
        step = (yaws[i+1] - yaws[i] + 180.0) % 360.0 - 180.0
        yaw_steps.append(step)

    min_yaw_step = float(np.min(yaw_steps)) if yaw_steps else 0.0
    max_yaw_step = float(np.max(yaw_steps)) if yaw_steps else 0.0

    # Ring should advance in one direction with small steps (e.g. 5 to 30 deg).
    # Negative step < -5.0 deg indicates ring reversal/foldback.
    # Large step > 45.0 deg indicates orientation discontinuity.
    if min_yaw_step < -5.0:
        failed_checks.append("NON_MONOTONIC_RING_TRAVERSAL")
    if max_yaw_step > 45.0:
        failed_checks.append("NEIGHBOR_ORIENTATION_DISCONTINUITY")

    orientation_pass = (len(failed_checks) == 0)

    return {
        "orientationPass": orientation_pass,
        "failedOrientationChecks": failed_checks,
        "metrics": {
            "MAX_ABS_ROLL_DEG": round(max_abs_roll, 2),
            "ROLL_STD_DEG": round(roll_std, 2),
            "MAX_ABS_PITCH_DEG": round(max_abs_pitch, 2),
            "MIN_ADJACENT_OPTICAL_AXIS_DOT": round(min_dot, 4),
            "MIN_ADJACENT_YAW_STEP_DEG": round(min_yaw_step, 2),
            "MAX_ADJACENT_YAW_STEP_DEG": round(max_yaw_step, 2)
        }
    }


def evaluate_horizon_oscillation(image: np.ndarray, num_strips: int = 24) -> dict:
    """Measure vertical horizon stability across sequential horizontal strips."""
    h, w = image.shape[:2]
    strip_w = w // num_strips
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

    centers_y = []
    for s in range(num_strips):
        strip = gray[:, s * strip_w : (s + 1) * strip_w]
        valid_rows = np.where(strip > 5)[0]
        if len(valid_rows) > 0:
            mid_y = (np.min(valid_rows) + np.max(valid_rows)) / 2.0
            centers_y.append(mid_y)

    if len(centers_y) < num_strips // 2:
        return {
            "horizonPass": False,
            "HORIZON_OSCILLATION_PX": float(h),
            "HORIZON_OSCILLATION_RATIO": 1.0
        }

    oscillation_px = float(np.std(centers_y))
    oscillation_ratio = oscillation_px / float(h)
    # Horizon should not bounce by more than 8% of canvas height across a 360 panorama
    horizon_pass = oscillation_ratio <= 0.08

    return {
        "horizonPass": horizon_pass,
        "HORIZON_OSCILLATION_PX": round(oscillation_px, 2),
        "HORIZON_OSCILLATION_RATIO": round(oscillation_ratio, 4)
    }


def evaluate_catastrophic_visual_sanity_gates(image: np.ndarray, cameras: list = None) -> dict:
    """
    Master evaluator for all catastrophic visual sanity gates.
    Must run BEFORE any aggregate metrics (H_BEND, SEAM_JUMP) are considered.
    """
    occ = evaluate_pixel_occupancy(image)
    horiz = evaluate_horizon_oscillation(image)
    orient = evaluate_orientation_sanity(cameras) if cameras else {"orientationPass": True, "failedOrientationChecks": [], "metrics": {}}

    failed_gates = []
    if not occ["occupancyPass"]:
        failed_gates.append(f"LOW_PIXEL_OCCUPANCY ({occ['VALID_PIXEL_OCCUPANCY_RATIO']:.2%} < 70%)")
    if not occ["interiorVoidPass"]:
        failed_gates.append(f"LARGE_INTERIOR_VOID ({occ['LARGEST_INVALID_INTERIOR_REGION_RATIO']:.4%} > 0.5%)")
    if not occ["connectedMaskPass"]:
        failed_gates.append(f"DISCONNECTED_MASK_COMPONENTS ({occ['VALID_MASK_COMPONENT_COUNT']} != 1)")
    if not horiz["horizonPass"]:
        failed_gates.append(f"EXTREME_HORIZON_OSCILLATION ({horiz['HORIZON_OSCILLATION_RATIO']:.2%} > 8%)")
    if not orient["orientationPass"]:
        for f in orient["failedOrientationChecks"]:
            failed_gates.append(f"ORIENTATION_GATE_FAIL: {f}")

    sanity_pass = (len(failed_gates) == 0)

    combined_metrics = {}
    combined_metrics.update(occ)
    combined_metrics.update(horiz)
    combined_metrics.update(orient.get("metrics", {}))

    return {
        "sanityPass": sanity_pass,
        "failedGates": failed_gates,
        "metrics": combined_metrics
    }

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


def evaluate_orientation_sanity(cameras: list[dict | object], expected_step_deg: float = None, hfov_deg: float = 68.0) -> dict:
    """
    Audit camera orientations for:
    - implausible roll
    - optical-axis foldback
    - non-monotonic ring traversal
    - camera inversion
    - plan-aware neighboring-frame orientation discontinuity (ORIENTATION_GATE_MODEL)
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
        if min_dot < 0.60:
            failed_checks.append("OPTICAL_AXIS_FOLDBACK")

    # 4. Ring monotonicity and plan-aware neighbor step check
    yaw_steps = []
    for i in range(N - 1):
        step = (yaws[i+1] - yaws[i] + 180.0) % 360.0 - 180.0
        yaw_steps.append(step)

    min_yaw_step = float(np.min(yaw_steps)) if yaw_steps else 0.0
    max_yaw_step = float(np.max(yaw_steps)) if yaw_steps else 0.0

    # Plan-Aware Orientation Gate Model:
    # Infers or takes expected step, adds physical sensor jitter and dwell movement tolerance,
    # and strictly caps tolerance at (HFOV - 15 deg) to guarantee overlap margin.
    if expected_step_deg is None:
        expected_step_deg = 360.0 / float(N)
    
    dynamic_tolerance = max(6.0, 0.15 * float(expected_step_deg))
    plan_step_tolerance_deg = min(float(hfov_deg) - 15.0, float(expected_step_deg) + dynamic_tolerance)

    if min_yaw_step < -5.0:
        failed_checks.append("NON_MONOTONIC_RING_TRAVERSAL")
    if max_yaw_step > plan_step_tolerance_deg:
        failed_checks.append(f"NEIGHBOR_ORIENTATION_DISCONTINUITY: {max_yaw_step:.2f} deg > {plan_step_tolerance_deg:.2f} deg")

    orientation_pass = (len(failed_checks) == 0)

    return {
        "orientationPass": orientation_pass,
        "failedOrientationChecks": failed_checks,
        "metrics": {
            "ORIENTATION_GATE_MODEL": "PLAN_AWARE_STEP_AND_HFOV_OVERLAP",
            "EXPECTED_STEP_DEG": round(float(expected_step_deg), 2),
            "PLAN_STEP_TOLERANCE_DEG": round(float(plan_step_tolerance_deg), 2),
            "MIN_YAW_STEP_TOLERANCE_DEG": -5.0,
            "HFOV_DEG": round(float(hfov_deg), 2),
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


def evaluate_band_topology(image: np.ndarray) -> dict:
    """
    Section 13 Visual Band Topology Gate:
    Detects:
    - multiple detached vertical image layers
    - lower-frame fragments
    - unexpected repeated bands
    - abrupt top/bottom envelope jumps
    """
    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    mask = (gray > 5).astype(np.uint8)

    # Close small interior scene dark features (e.g. black TVs, computer screens, dark furniture)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 35))
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    step_x = max(1, w // 1000)
    cols_sampled = list(range(0, w, step_x))
    multi_layer_count = 0
    bottom_fragment_count = 0
    top_ys = []
    bot_ys = []

    for x in cols_sampled:
        col = closed[:, x]
        idx = np.where(col > 0)[0]
        if len(idx) == 0:
            continue
        top_ys.append(float(idx[0]))
        bot_ys.append(float(idx[-1]))

        diffs = np.diff(idx)
        gaps = np.where(diffs > 40)[0]
        if len(gaps) > 0:
            multi_layer_count += 1
            for g in gaps:
                if idx[g] > h * 0.60:
                    bottom_fragment_count += 1
                    break

    total_valid_cols = max(1, len(top_ys))
    multi_layer_ratio = multi_layer_count / total_valid_cols
    bottom_fragment_ratio = bottom_fragment_count / total_valid_cols

    top_jumps = np.abs(np.diff(top_ys)) if len(top_ys) > 1 else [0.0]
    bot_jumps = np.abs(np.diff(bot_ys)) if len(bot_ys) > 1 else [0.0]
    top_jump_p95 = float(np.percentile(top_jumps, 95))
    bot_jump_p95 = float(np.percentile(bot_jumps, 95))

    topology_pass = (multi_layer_ratio <= 0.08) and (bottom_fragment_ratio <= 0.08) and (top_jump_p95 <= 50.0) and (bot_jump_p95 <= 50.0)
    
    failed_topology = []
    if multi_layer_ratio > 0.08:
        failed_topology.append(f"MULTI_LAYER_COLUMNS ({multi_layer_ratio:.2%} > 8.0%)")
    if bottom_fragment_ratio > 0.08:
        failed_topology.append(f"BOTTOM_FRAGMENTS ({bottom_fragment_ratio:.2%} > 8.0%)")
    if top_jump_p95 > 50.0:
        failed_topology.append(f"TOP_ENVELOPE_JUMP ({top_jump_p95:.1f}px > 50px)")
    if bot_jump_p95 > 50.0:
        failed_topology.append(f"BOTTOM_ENVELOPE_JUMP ({bot_jump_p95:.1f}px > 50px)")

    return {
        "topologyPass": topology_pass,
        "failedTopologyChecks": failed_topology,
        "MULTI_LAYER_COLUMN_RATIO": round(multi_layer_ratio, 4),
        "BOTTOM_FRAGMENT_RATIO": round(bottom_fragment_ratio, 4),
        "TOP_ENVELOPE_JUMP_P95": round(top_jump_p95, 2),
        "BOTTOM_ENVELOPE_JUMP_P95": round(bot_jump_p95, 2)
    }


def evaluate_structural_orientation(image: np.ndarray) -> dict:
    """
    Section 14 Structural Orientation Gate:
    Measures detected near-vertical and near-horizontal line distributions.
    """
    h, w = image.shape[:2]
    scale = min(1.0, 1600.0 / max(h, w))
    sm_h, sm_w = int(round(h * scale)), int(round(w * scale))
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    gray_sm = cv2.resize(gray, (sm_w, sm_h), interpolation=cv2.INTER_AREA)

    edges = cv2.Canny(gray_sm, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80, minLineLength=40, maxLineGap=10)

    if lines is None or len(lines) == 0:
        return {
            "structuralPass": True,
            "NEAR_VERTICAL_LINE_COUNT": 0,
            "NEAR_HORIZONTAL_LINE_COUNT": 0,
            "VERTICAL_LINE_BENDING_SCORE": 0.0,
            "HORIZONTAL_LINE_BENDING_SCORE": 0.0
        }

    vert_angles = []
    horiz_angles = []
    for line in lines:
        l = line.ravel()
        if len(l) < 4:
            continue
        x1, y1, x2, y2 = float(l[0]), float(l[1]), float(l[2]), float(l[3])
        angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
        angle = (angle + 180.0) % 180.0
        if 75.0 <= angle <= 105.0:
            vert_angles.append(abs(angle - 90.0))
        elif angle <= 15.0 or angle >= 165.0:
            dev = min(angle, 180.0 - angle)
            horiz_angles.append(dev)

    vert_score = float(np.mean(vert_angles)) if vert_angles else 0.0
    horiz_score = float(np.mean(horiz_angles)) if horiz_angles else 0.0

    return {
        "structuralPass": vert_score <= 8.0,
        "NEAR_VERTICAL_LINE_COUNT": len(vert_angles),
        "NEAR_HORIZONTAL_LINE_COUNT": len(horiz_angles),
        "VERTICAL_LINE_BENDING_SCORE": round(vert_score, 2),
        "HORIZONTAL_LINE_BENDING_SCORE": round(horiz_score, 2)
    }


def evaluate_catastrophic_visual_sanity_gates(image: np.ndarray, cameras: list = None, expected_step_deg: float = None, hfov_deg: float = 68.0) -> dict:
    """
    Master evaluator for all catastrophic visual sanity gates.
    Must run BEFORE any aggregate metrics (H_BEND, SEAM_JUMP) are considered.
    """
    occ = evaluate_pixel_occupancy(image)
    horiz = evaluate_horizon_oscillation(image)
    topo = evaluate_band_topology(image)
    struct = evaluate_structural_orientation(image)
    orient = evaluate_orientation_sanity(cameras, expected_step_deg=expected_step_deg, hfov_deg=hfov_deg) if cameras else {"orientationPass": True, "failedOrientationChecks": [], "metrics": {}}

    failed_gates = []
    if not occ["occupancyPass"]:
        failed_gates.append(f"LOW_PIXEL_OCCUPANCY ({occ['VALID_PIXEL_OCCUPANCY_RATIO']:.2%} < 70%)")
    if not occ["interiorVoidPass"]:
        failed_gates.append(f"LARGE_INTERIOR_VOID ({occ['LARGEST_INVALID_INTERIOR_REGION_RATIO']:.4%} > 0.5%)")
    if not occ["connectedMaskPass"]:
        failed_gates.append(f"DISCONNECTED_MASK_COMPONENTS ({occ['VALID_MASK_COMPONENT_COUNT']} != 1)")
    if not horiz["horizonPass"]:
        failed_gates.append(f"EXTREME_HORIZON_OSCILLATION ({horiz['HORIZON_OSCILLATION_RATIO']:.2%} > 8%)")
    if not topo["topologyPass"]:
        for f in topo["failedTopologyChecks"]:
            failed_gates.append(f"TOPOLOGY_GATE_FAIL: {f}")
    if not orient["orientationPass"]:
        for f in orient["failedOrientationChecks"]:
            failed_gates.append(f"ORIENTATION_GATE_FAIL: {f}")

    sanity_pass = (len(failed_gates) == 0)

    combined_metrics = {}
    combined_metrics.update(occ)
    combined_metrics.update(horiz)
    combined_metrics.update(topo)
    combined_metrics.update(struct)
    combined_metrics.update(orient.get("metrics", {}))

    return {
        "sanityPass": sanity_pass,
        "failedGates": failed_gates,
        "metrics": combined_metrics
    }

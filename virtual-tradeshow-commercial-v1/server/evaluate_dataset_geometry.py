#!/usr/bin/env python3
"""
evaluate_dataset_geometry.py
─────────────────────────────────────────────────────────────────────────────
Empirical Geometry Evaluator for Discovered Capture Datasets (Round 98)

Evaluates candidate image sequences using genuine computer vision measurements:
  1. Feature Detection (ORB / SIFT)
  2. Pairwise Feature Matching & Epipolar Verification (cv2.findEssentialMat, recoverPose)
  3. Camera Graph Construction & Connected Component Analysis (BFS)
  4. 360-degree Ring & Loop-Closure Residual Measurement (Frobenius / Angle / Translation Drift)
  5. Empirical Classification (Positive Complete Ring vs Negative Partial Fixture)
─────────────────────────────────────────────────────────────────────────────
"""

import os
import sys
import json
import math
import argparse
import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None


def evaluate_dataset_geometry(image_dir, max_frames=12, max_dim=320):
    if cv2 is None:
        return {
            "success": False,
            "category": "INSUFFICIENT_METADATA_TO_EVALUATE",
            "classification": "EVALUATOR_UNAVAILABLE",
            "classificationReason": "OpenCV not available in runtime environment"
        }

    if not os.path.isdir(image_dir):
        return {
            "success": False,
            "category": "INSUFFICIENT_METADATA_TO_EVALUATE",
            "classification": "DIRECTORY_MISSING",
            "classificationReason": f"Directory not found: {image_dir}"
        }

    image_files = sorted([f for f in os.listdir(image_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
    if len(image_files) < 3:
        return {
            "success": False,
            "category": "INSUFFICIENT_METADATA_TO_EVALUATE",
            "classification": "INSUFFICIENT_VIEWS",
            "classificationReason": f"Found {len(image_files)} image files (minimum 3 required for multi-view geometry)",
            "imageCount": len(image_files)
        }

    # Evenly sample up to max_frames
    if len(image_files) > max_frames:
        indices = np.linspace(0, len(image_files) - 1, max_frames, dtype=int)
        selected_files = [image_files[i] for i in indices]
    else:
        selected_files = image_files

    imgs_gray = []
    w_first, h_first = 0, 0

    for fname in selected_files:
        p = os.path.join(image_dir, fname)
        img = cv2.imread(p)
        if img is None:
            continue
        h, w = img.shape[:2]
        if w_first == 0:
            w_first, h_first = w, h
        scale = min(1.0, max_dim / max(w, h))
        if scale < 1.0:
            nw, nh = max(16, int(w * scale)), max(16, int(h * scale))
            img_small = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
        else:
            img_small = img
        gray = cv2.cvtColor(img_small, cv2.COLOR_BGR2GRAY)
        imgs_gray.append(gray)

    n_views = len(imgs_gray)
    if n_views < 3:
        return {
            "success": False,
            "category": "INSUFFICIENT_METADATA_TO_EVALUATE",
            "classification": "UNREADABLE_IMAGE_FILES",
            "classificationReason": "Could not read at least 3 valid image frames",
            "imageCount": len(image_files)
        }

    if w_first < 512 or h_first < 512:
        return {
            "success": True,
            "category": "INSUFFICIENT_RESOLUTION_OR_KEYFRAME",
            "classification": "INSUFFICIENT_RESOLUTION_OR_KEYFRAME",
            "classificationReason": f"Low resolution ({w_first}x{h_first} < 512x512) or ephemeral keyframes",
            "imageCount": len(image_files),
            "sampleDimensions": f"{w_first}x{h_first}"
        }

    h_s, w_s = imgs_gray[0].shape[:2]
    fov_rad = math.radians(60.0)
    f = 0.5 * w_s / math.tan(fov_rad / 2.0)
    K = np.array([[f, 0, w_s / 2.0], [0, f, h_s / 2.0], [0, 0, 1.0]], dtype=np.float64)

    # Feature extraction (ORB with up to 1000 features)
    orb = cv2.ORB_create(nfeatures=1000)
    kp_des = []
    total_kp = 0
    for g in imgs_gray:
        kp, des = orb.detectAndCompute(g, None)
        kp_des.append((kp, des))
        total_kp += len(kp) if kp is not None else 0

    avg_kp = total_kp / n_views
    if avg_kp < 20:
        return {
            "success": True,
            "category": "INSUFFICIENT_METADATA_TO_EVALUATE",
            "classification": "INSUFFICIENT_TEXTURE_OR_FEATURES",
            "classificationReason": f"Low feature texture (avg {avg_kp:.1f} kp/view < 20)",
            "imageCount": len(image_files),
            "sampleDimensions": f"{w_first}x{h_first}",
            "featuresDetected": int(avg_kp),
            "crossPairMatches": 0,
            "connectedViews": 0,
            "loopClosurePassed": False
        }

    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    adj_inliers = {}
    rel_poses = {}
    adj_graph = {i: [] for i in range(n_views)}
    total_inliers = 0

    for i in range(n_views):
        j = (i + 1) % n_views
        des1 = kp_des[i][1]
        des2 = kp_des[j][1]
        if des1 is None or des2 is None or len(des1) < 8 or len(des2) < 8:
            continue
        matches = bf.match(des1, des2)
        matches = sorted(matches, key=lambda x: x.distance)
        good = [m for m in matches if m.distance < 64]
        if len(good) >= 8:
            pts_i = np.float32([kp_des[i][0][m.queryIdx].pt for m in good])
            pts_j = np.float32([kp_des[j][0][m.trainIdx].pt for m in good])
            E, mask = cv2.findEssentialMat(pts_i, pts_j, K, method=cv2.RANSAC, prob=0.99, threshold=2.0)
            if mask is not None:
                _, R_rel, t_rel, mask_p = cv2.recoverPose(E, pts_i, pts_j, K, mask=mask)
                inlier_cnt = int(np.sum(mask_p > 0))
                if inlier_cnt >= 6:
                    adj_inliers[(i, j)] = inlier_cnt
                    rel_poses[(i, j)] = (R_rel, t_rel)
                    adj_graph[i].append(j)
                    adj_graph[j].append(i)
                    total_inliers += inlier_cnt

    # Connected components via BFS
    visited = set()
    components = []
    for i in range(n_views):
        if i not in visited:
            comp = []
            queue = [i]
            visited.add(i)
            while queue:
                curr = queue.pop(0)
                comp.append(curr)
                for neighbor in adj_graph[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            components.append(sorted(comp))

    components.sort(key=lambda c: len(c), reverse=True)
    component_sizes = [len(c) for c in components]
    max_component_size = component_sizes[0] if component_sizes else 0

    # 360-degree ring closure test
    ring_closed = all((i, (i + 1) % n_views) in rel_poses for i in range(n_views))
    loop_residual = None
    loop_closure_passed = False

    if ring_closed:
        R_cum = np.eye(3)
        t_cum = np.zeros((3, 1))
        for i in range(n_views):
            j = (i + 1) % n_views
            R_rel, t_rel = rel_poses[(i, j)]
            t_cum = t_cum + R_cum @ t_rel
            R_cum = R_rel @ R_cum

        rot_drift_frob = float(np.linalg.norm(R_cum - np.eye(3), 'fro'))
        cos_ang = max(-1.0, min(1.0, (np.trace(R_cum) - 1.0) / 2.0))
        rot_drift_deg = float(math.degrees(math.acos(cos_ang)))
        trans_drift_rel = float(np.linalg.norm(t_cum) / float(n_views))

        loop_closure_passed = (rot_drift_frob <= 0.50 and rot_drift_deg <= 15.0 and trans_drift_rel <= 0.20)
        loop_residual = {
            "status": "LOOP_CLOSURE_VERIFIED" if loop_closure_passed else "LOOP_CLOSURE_FAILED_EXCEEDS_TOLERANCE",
            "closurePassed": loop_closure_passed,
            "measured": {
                "rotationDriftFrobenius": round(rot_drift_frob, 4),
                "rotationDriftDegrees": round(rot_drift_deg, 2),
                "translationDriftRelative": round(trans_drift_rel, 4)
            },
            "thresholds": {
                "maxRotationDriftFrobenius": 0.50,
                "maxRotationAngleDegrees": 15.0,
                "maxTranslationDriftRelative": 0.20
            }
        }
    else:
        loop_residual = {
            "status": "RING_INCOMPLETE_LOOP_NOT_FORMED",
            "closurePassed": False,
            "measured": {
                "rotationDriftFrobenius": None,
                "rotationDriftDegrees": None,
                "translationDriftRelative": None
            },
            "thresholds": {
                "maxRotationDriftFrobenius": 0.50,
                "maxRotationAngleDegrees": 15.0,
                "maxTranslationDriftRelative": 0.20
            }
        }

    has_parallax = (total_inliers >= 15 and len(adj_inliers) >= 2)
    is_positive = (max_component_size == n_views and loop_closure_passed and n_views >= 12 and has_parallax)
    is_negative = (has_parallax and (max_component_size < n_views or not loop_closure_passed))

    if is_positive:
        classification = "POSITIVE_COMPLETE_RING_FIXTURE_VERIFIED"
        reason = f"Full {n_views}/{n_views} ring coverage, verified translation parallax ({total_inliers} inliers), and closed loop residual."
    elif is_negative:
        classification = "NEGATIVE_PARTIAL_FIXTURE_VERIFIED"
        if not ring_closed:
            reason = f"Partial graph connectivity ({max_component_size}/{n_views} views connected in main component); ring incomplete."
        else:
            reason = f"Connected views ({max_component_size}/{n_views}) but loop closure exceeded tolerance ({loop_residual['measured']['rotationDriftDegrees']} deg drift)."
    else:
        classification = "INELIGIBLE_INSUFFICIENT_PARALLAX_OR_DISCONNECTED"
        reason = f"Insufficient matchable parallax or disconnected camera stations (inliers: {total_inliers}, connected: {max_component_size}/{n_views})."

    return {
        "success": True,
        "category": "GEOMETRY_EVALUATED_DATASET",
        "classification": classification,
        "classificationReason": reason,
        "imageCount": len(image_files),
        "evaluatedViews": n_views,
        "sampleDimensions": f"{w_first}x{h_first}",
        "featuresDetected": int(avg_kp),
        "crossPairMatches": total_inliers,
        "connectedViews": max_component_size,
        "connectedComponentCount": len(components),
        "componentSizes": component_sizes,
        "loopClosurePassed": loop_closure_passed,
        "loopClosureResidual": loop_residual,
        "hasRecoverableParallax": has_parallax,
        "scaleDisclosure": "SCALE_FREE_EMPIRICAL_MEASUREMENT"
    }


def main():
    parser = argparse.ArgumentParser(description="Empirical Geometry Evaluator for Discovered Capture Datasets")
    parser.add_argument("image_dir", help="Path to image directory")
    parser.add_argument("--max-frames", type=int, default=12, help="Maximum frames to evaluate")
    parser.add_argument("--max-dim", type=int, default=320, help="Downscaled dimension for fast evaluation")
    args = parser.parse_args()

    result = evaluate_dataset_geometry(args.image_dir, max_frames=args.max_frames, max_dim=args.max_dim)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

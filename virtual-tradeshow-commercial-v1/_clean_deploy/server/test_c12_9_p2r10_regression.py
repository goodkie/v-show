#!/usr/bin/env python3
"""
Regression Test Suite: C12.9-P2R10
Production Adaptive Multi-Hop Stitch Input Selection, Calibrated SO(3) Ring Validation,
Guided-Session Frame-Cap Decoupling, and LLST42 Authoritative Physical Regression Lock.
"""

import os
import sys
import unittest
import json
import numpy as np

server_dir = os.path.abspath(os.path.dirname(__file__))
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

import panorama_geometry_validator as pgv
import stitch_aware_selector as sas
import opencv_panorama_worker as opw

LLST42_DIR = r"e:\vivpr\ai\v-show\production_artifacts\mobile_runtime_inspector\LLST42"

class TestC129P2R10Regression(unittest.TestCase):
    """Authoritative physical and architectural regression locks for C12.9-P2R10."""

    def test_01_invariant_locks(self):
        """Verify strict non-negotiable architectural invariant flags."""
        self.assertFalse(pgv.RAW_H_CONDITION_NUMBER_HARD_GATE, "RAW_H_CONDITION_NUMBER_HARD_GATE must remain False")
        self.assertFalse(pgv.ESSENTIAL_MATRIX_PRIMARY_MODEL, "ESSENTIAL_MATRIX_PRIMARY_MODEL must remain False")
        self.assertFalse(pgv.FORCED_EDGE_POLICY, "FORCED_EDGE_POLICY must remain False")

        self.assertEqual(pgv.MIN_INLIER_COUNT, 15, "Pure rotation minimum inlier count must be 15")
        self.assertEqual(pgv.MIN_INLIER_RATIO, 0.18, "Pure rotation minimum inlier ratio must be 0.18")
        self.assertAlmostEqual(pgv.MAX_PURE_ROT_REPROJ_PX, 3.50, places=2, msg="Maximum reprojection error threshold lock")
        self.assertEqual(pgv.MIN_SPATIAL_CELLS, 4, "Spatial support cell threshold must be 4")

        self.assertEqual(sas.MAX_ALLOWED_STITCH_INPUT_COUNT, 48, "MAX_PANORAMA_STITCH_INPUTS safety ceiling must be 48")
        self.assertEqual(opw.MIN_REGISTRATION_RETENTION, 0.85, "OpenCV camera retention gate must be 0.85")
        self.assertEqual(opw.FULL_360_MIN_COVERAGE_DEG, 340.0, "Full 360 minimum coverage threshold must be 340.0 deg")

    def test_02_calibrated_so3_svd_extraction(self):
        """Verify calibrated SVD SO(3) pure-rotation decomposition."""
        yaw_rad = np.deg2rad(25.0)
        R_true = np.array([
            [np.cos(yaw_rad), 0, np.sin(yaw_rad)],
            [0, 1, 0],
            [-np.sin(yaw_rad), 0, np.cos(yaw_rad)]
        ], dtype=np.float64)

        K = pgv.build_intrinsics_matrix(1080, 1920)
        H_pure = K @ R_true @ np.linalg.inv(K)
        H_pure /= H_pure[2, 2]

        R_recovered, angle_deg, orth_err = pgv.extract_so3_rotation(H_pure, K)
        self.assertAlmostEqual(angle_deg, 25.0, places=3, msg="Recovered angle must match ground truth rotation")
        self.assertLess(orth_err, 1e-6, "SO(3) matrix must be orthogonal")
        det_R = np.linalg.det(R_recovered)
        self.assertAlmostEqual(det_R, 1.0, places=5, msg="SO(3) matrix determinant must be 1")

    def test_03_preflight_graph_disconnect_gate(self):
        """Verify opencv_panorama_worker blocks disconnected input graphs."""
        dummy_input = {
            "sources": [{"path": "dummy1.jpg", "slot": "SHOT_01"}, {"path": "dummy2.jpg", "slot": "SHOT_02"}],
            "visualGraphConnected": False
        }
        res = opw.run_opencv_stitching(dummy_input)
        self.assertEqual(res.get("status"), "FAILED")
        self.assertEqual(res.get("errorCode"), "PANORAMA_RING_GRAPH_DISCONNECTED")
        self.assertFalse(res.get("geometryValid"))

    def test_04_camera_retention_rejection_gate(self):
        """Verify opencv_panorama_worker rejects camera dropouts below 85%."""
        dummy_input = {
            "sources": [{"path": f"nonexistent_{i}.jpg", "slot": f"SHOT_{i}"} for i in range(12)],
            "visualGraphConnected": True
        }
        res = opw.run_opencv_stitching(dummy_input)
        self.assertEqual(res.get("status"), "FAILED")

    def test_05_llst42_adaptive_multi_hop_manifest(self):
        """Verify LLST42 physical regression: decoupling canonical 12 from 40 stitch inputs."""
        manifest_path = os.path.join(LLST42_DIR, "panorama_input_manifest.json")
        self.assertTrue(os.path.exists(manifest_path), f"Manifest must exist at {manifest_path}")

        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest.get("sessionId"), "LLST42")
        self.assertTrue(manifest.get("visualGraphConnected"), "Visual graph must be connected")
        self.assertEqual(manifest.get("visualGraphComponentCount"), 1, "Graph component count must be 1")

        canonical_ids = manifest.get("canonicalFrameIds", [])
        stitch_ids = manifest.get("panoramaStitchFrameIds", [])
        bridge_ids = manifest.get("supplementalBridgeFrameIds", [])

        self.assertEqual(len(canonical_ids), 12, "Customer canonical target must remain 12 frames")
        self.assertEqual(len(stitch_ids), 40, "LLST42 full ring stitch input count must be 40 frames")
        self.assertEqual(len(bridge_ids), 28, "Supplemental physical bridge count must be 28 frames")
        self.assertLessEqual(len(stitch_ids), 48, "Stitch input count must not exceed safety ceiling 48")

        candidates_dir = os.path.join(LLST42_DIR, "candidates")
        for frame in manifest.get("frames", []):
            fpath = frame.get("path") or os.path.join(candidates_dir, f"{frame['candidateId']}.jpg")
            self.assertTrue(os.path.exists(fpath), f"Frame file must exist: {fpath}")
            self.assertGreater(os.path.getsize(fpath), 0, f"Frame file must be non-empty: {fpath}")

if __name__ == "__main__":
    unittest.main()

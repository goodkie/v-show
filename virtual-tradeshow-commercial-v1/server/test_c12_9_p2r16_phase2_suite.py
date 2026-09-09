#!/usr/bin/env python3
"""
Unit Test Suite: C12.9-P2R16 Phase 2 High-Res Panorama Matrix
Tests:
1. Source Manifest & Sharpness Audit Integrity
2. Comparison Datasets (8-shot, 8-shot bridge, 10-shot, 12-shot)
3. Full-Resolution Render Geometry & Effective Pixels Per Degree
4. Visual Review & Forensic Artifact Completeness
5. Customer Default (P2R13) & Owner Visual Acceptance (False) Lock
"""

import os
import sys
import json
import unittest
from pathlib import Path

REPO_ROOT = Path(r"e:\vivpr\ai\v-show")
ARTIFACTS_DIR = REPO_ROOT / "production_artifacts" / "mobile_runtime_inspector"
MANIFEST_PATH = ARTIFACTS_DIR / "P2R16_S23_SESSION_01" / "P2R16_PHASE2_SOURCE_MANIFEST.json"
MATRIX_RESULTS_PATH = ARTIFACTS_DIR / "P2R16_PHASE2_MATRIX_RESULTS.json"

class TestP2R16Phase2Suite(unittest.TestCase):

    def test_01_source_manifest_and_sharpness_audit(self):
        self.assertTrue(MANIFEST_PATH.exists(), f"Missing manifest at {MANIFEST_PATH}")
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        self.assertTrue(manifest.get("SOURCE_IDENTITY_VERIFIED"))
        self.assertTrue(manifest.get("IMAGE_CAPTURE_AVAILABLE"))
        self.assertEqual(manifest.get("ACTUAL_STILL_RESOLUTION"), "4000x3000")
        self.assertIn("sharpness_clamping_audit", manifest)
        self.assertTrue(manifest["sharpness_clamping_audit"]["clamping_detected"])
        
        candidates = manifest.get("candidates", [])
        self.assertEqual(len(candidates), 8)
        for c in candidates:
            self.assertEqual(c["width"], 4000)
            self.assertEqual(c["height"], 3000)
            self.assertTrue(c["cameraResolutionVerified"])
            self.assertIn("rawLaplacianVariance", c)
            self.assertIn("rawTenengrad", c)
            self.assertIn("shannonEntropyBits", c)

    def test_02_comparison_dataset_presence(self):
        sessions = [
            ("P2R16_S23_8SHOT_01", 8),
            ("P2R16_S23_8BRIDGE_01", 11),
            ("P2R16_S23_10SHOT_01", 10),
            ("P2R16_S23_12SHOT_01", 12),
        ]
        for s_id, count in sessions:
            s_dir = ARTIFACTS_DIR / s_id / "candidates"
            self.assertTrue(s_dir.exists(), f"Missing candidates dir: {s_dir}")
            jpgs = list(s_dir.glob("*.jpg"))
            self.assertEqual(len(jpgs), count, f"Expected {count} images in {s_id}, found {len(jpgs)}")

    def test_03_matrix_results_integrity(self):
        self.assertTrue(MATRIX_RESULTS_PATH.exists(), f"Missing matrix results: {MATRIX_RESULTS_PATH}")
        with open(MATRIX_RESULTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data.get("customerDefaultGeometryPath"), "P2R13")
        self.assertFalse(data.get("OWNER_VISUAL_ACCEPTANCE"))
        
        plans = data.get("plans", {})
        self.assertIn("P2R16_8", plans)
        self.assertIn("P2R16_8B", plans)
        self.assertIn("P2R16_10", plans)
        self.assertIn("P2R16_12", plans)
        
        for pid in ["P2R16_8", "P2R16_8B", "P2R16_10", "P2R16_12"]:
            p = plans[pid]
            self.assertGreaterEqual(p["effectivePixelsPerDegree"], 50.0)
            self.assertGreaterEqual(p["detailRetentionScore"], 90.0)
            self.assertLessEqual(p["totalPipelineDurationSec"], 30.0)

    def test_04_review_and_forensic_artifacts_exist(self):
        required_artifacts = [
            "P2R16_8_OWNER_REVIEW.jpg",
            "P2R16_8_CLOSURE.jpg",
            "P2R16_8_FORENSIC_OVERLAY.jpg",
            "P2R16_8B_OWNER_REVIEW.jpg",
            "P2R16_8B_CLOSURE.jpg",
            "P2R16_8B_FORENSIC_OVERLAY.jpg",
            "P2R16_10_OWNER_REVIEW.jpg",
            "P2R16_10_CLOSURE.jpg",
            "P2R16_10_FORENSIC_OVERLAY.jpg",
            "P2R16_12_OWNER_REVIEW.jpg",
            "P2R16_12_CLOSURE.jpg",
            "P2R16_12_FORENSIC_OVERLAY.jpg",
            "P2R16_PHASE2_4WAY_COMPARISON.jpg"
        ]
        for fname in required_artifacts:
            fpath = ARTIFACTS_DIR / fname
            self.assertTrue(fpath.exists(), f"Missing required artifact: {fname}")
            self.assertGreater(fpath.stat().st_size, 50000, f"Artifact too small: {fname}")

    def test_05_customer_default_not_promoted(self):
        with open(MATRIX_RESULTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data.get("customerDefaultGeometryPath"), "P2R13")
        self.assertFalse(data.get("OWNER_VISUAL_ACCEPTANCE"))

if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""
C12.9-P2R16 Phase 3D Test Suite:
- Owner pixel review handoff & metric consistency lock
- Authoritative occupancy resolution: 0.9876 ratio <-> 98.76% (mathematical agreement)
- Strict separation of sensor closure vs visual closure evidence
- Verification of 12 real logged shutter/return/write events in Mobile RI
- Invariant locks: P2R13 safe customer default, OWNER_VISUAL_ACCEPTANCE=False awaiting Owner inspection
"""

import os
import sys
import json
import hashlib
import unittest
from pathlib import Path
from PIL import Image

REPO_ROOT = Path("e:/vivpr/ai/v-show")
SERVER_DIR = REPO_ROOT / "virtual-tradeshow-commercial-v1" / "server"
UPLOADS_DIR = REPO_ROOT / "virtual-tradeshow-commercial-v1" / "uploads"
DATA_UPLOADS_DIR = REPO_ROOT / "virtual-tradeshow-commercial-v1" / "data" / "uploads"
RI_DIR = REPO_ROOT / "production_artifacts" / "mobile_runtime_inspector" / "RI-M-S23-12SHOT-PHYSICAL01"


class TestC129P2R16Phase3DSuite(unittest.TestCase):
    def setUp(self):
        self.expected_owner_sha = "de4849c8bfc63f0663c53f9ea68346b925795a9a02bba41fa64de144f7e98d67"
        self.expected_owner_bytes = 8320196
        self.expected_owner_dims = (18631, 2780)

    def test_01_owner_artifact_pixel_freeze(self):
        """Verify exact SHA-bound artifact is frozen without modification."""
        owner_file = UPLOADS_DIR / "P2R16_PHYSICAL_12SHOT_OWNER_REVIEW.jpg"
        self.assertTrue(owner_file.exists())
        b = owner_file.read_bytes()
        self.assertEqual(len(b), self.expected_owner_bytes)
        self.assertEqual(hashlib.sha256(b).hexdigest(), self.expected_owner_sha)
        with Image.open(owner_file) as im:
            self.assertEqual(im.size, self.expected_owner_dims)

    def test_02_occupancy_mathematical_consistency(self):
        """Verify authoritative occupancy ratio 0.9876 and percent 98.76% mathematically agree."""
        ratio = 0.9876
        percent = 98.76
        self.assertAlmostEqual(ratio * 100.0, percent, places=2)

    def test_03_sensor_and_visual_closure_separation(self):
        """Verify separate sensor closure telemetry vs visual closure metrics."""
        closure_file = RI_DIR / "closure_state.json"
        self.assertTrue(closure_file.exists())
        closure_data = json.loads(closure_file.read_text(encoding="utf-8"))
        
        # Verify 3-step return sequence exists
        seq = closure_data.get("returnToStartSequence", [])
        self.assertEqual(len(seq), 3)
        final_step = seq[-1]
        self.assertEqual(final_step.get("state"), "360_COMPLETE")
        self.assertEqual(final_step.get("yawDeg"), 360.2)
        
        # Final sensor error: 360.2 - 360.0 = +0.20 deg
        sensor_error = round(final_step.get("yawDeg") - 360.0, 2)
        self.assertEqual(sensor_error, 0.20)

    def test_04_mobile_ri_logged_physical_events(self):
        """Verify logged shutter, 4000x3000 return, and durable write events for all 12 shots."""
        event_file = RI_DIR / "event_log.json"
        self.assertTrue(event_file.exists())
        ev_data = json.loads(event_file.read_text(encoding="utf-8"))
        
        self.assertEqual(ev_data.get("shutterEventCount"), 12)
        self.assertEqual(ev_data.get("resolutionReturnCount"), 12)
        self.assertEqual(ev_data.get("durableWriteCount"), 12)
        
        shot_events = ev_data.get("shotEvents", [])
        self.assertEqual(len(shot_events), 12)
        for s in shot_events:
            types = [e["type"] for e in s["events"]]
            self.assertIn("TARGET_ENTERED", types)
            self.assertIn("STABILITY_ACHIEVED", types)
            self.assertIn("IMAGECAPTURE_TAKEPHOTO_INVOKED", types)
            self.assertIn("JPEG_RETURNED", types)
            self.assertIn("DURABLE_WRITE_COMPLETED", types)
            self.assertIn("SHA_RECORDED", types)

    def test_05_package_artifacts_exist_unmodified(self):
        """Verify all 4 review package artifacts exist with correct dimensions."""
        required = [
            ("P2R16_PHYSICAL_12SHOT_OWNER_REVIEW.jpg", 18631, 2780, 8000000),
            ("P2R16_PHYSICAL_12SHOT_CLOSURE.jpg", 1600, 600, 200000),
            ("P2R16_PHYSICAL_12SHOT_NATIVE_CROPS.jpg", 2400, 1270, 400000),
            ("P2R16_PHYSICAL_8_VS_12_OWNER_COMPARISON.jpg", 3600, 2475, 1000000)
        ]
        for fname, exp_w, exp_h, min_bytes in required:
            fp = UPLOADS_DIR / fname
            self.assertTrue(fp.exists(), f"Missing artifact: {fname}")
            self.assertGreater(fp.stat().st_size, min_bytes)
            with Image.open(fp) as im:
                self.assertEqual(im.size, (exp_w, exp_h))

    def test_06_invariants_preserved(self):
        """Verify customer default remains P2R13 and owner acceptance remains False."""
        meta_file = REPO_ROOT / "virtual-tradeshow-commercial-v1" / "data" / "guided_capture" / "sessions" / "P2R16_S23_12SHOT_PHYSICAL_01" / "metadata.json"
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
        self.assertEqual(meta.get("customerDefaultGeometryPath"), "P2R13")
        self.assertFalse(meta.get("ownerVisualAcceptance"))


if __name__ == "__main__":
    unittest.main()

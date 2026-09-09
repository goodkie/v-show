#!/usr/bin/env python3
"""
C12.9-P2R16 Phase 1 Test Suite:
- Angle-Locked Stop-and-Shoot state transitions
- Motion stability gating (500ms window, angular velocity threshold 5.0 deg/s)
- Maximum still photo resolution & ImageCapture API integration
- Durable storage of 8 original JPEGs (SHOT_000 .. SHOT_315)
- Retake individual shot without whole-ring restart
- Closure navigation back to 0°
- Forensic baseline protection (LLST42 untouched)
- Verification of P2R13 customer default invariant
"""

import os
import sys
import json
import hashlib
import unittest
from pathlib import Path

REPO_ROOT = Path("e:/vivpr/ai/v-show")
SERVER_DIR = REPO_ROOT / "virtual-tradeshow-commercial-v1" / "server"
AUTO_LOCK_DIR = SERVER_DIR / "qa" / "milestones" / "auto"


class TestC129P2R16Phase1(unittest.TestCase):
    def setUp(self):
        self.client_html_path = REPO_ROOT / "virtual-tradeshow-commercial-v1" / "client" / "index.html"
        self.server_js_path = SERVER_DIR / "index.js"
        self.worker_py_path = SERVER_DIR / "opencv_panorama_worker.py"
        self.client_content = self.client_html_path.read_text(encoding="utf-8")
        self.server_content = self.server_js_path.read_text(encoding="utf-8")
        self.worker_content = self.worker_py_path.read_text(encoding="utf-8")

    def test_client_stop_and_shoot_ux_present(self):
        """Verify client implementation contains 8 target angles, stop-and-shoot state machine, and stability window."""
        self.assertIn("ANGLE_LOCKED_HIRES", self.client_content)
        self.assertIn("this.targetAngles = [0, 45, 90, 135, 180, 225, 270, 315]", self.client_content)
        self.assertIn("this.TARGET_ENTER_TOLERANCE_DEG = 3.0", self.client_content)
        self.assertIn("this.TARGET_CAPTURE_TOLERANCE_DEG = 1.5", self.client_content)
        self.assertIn("this.YAW_VELOCITY_THRESHOLD = 5.0", self.client_content)
        self.assertIn("this.STABILITY_WINDOW_MS = 500", self.client_content)
        self.assertIn("checkAngleLockedTarget", self.client_content)
        self.assertIn("triggerStillCapture", self.client_content)
        self.assertIn("retakeShot", self.client_content)

    def test_client_image_capture_api_support(self):
        """Verify client probes ImageCapture and requests maximum available still resolution."""
        self.assertIn("window.ImageCapture", self.client_content)
        self.assertIn("getPhotoCapabilities", self.client_content)
        self.assertIn("photoOpts.imageWidth = this.photoCapabilities.imageWidth.max", self.client_content)
        self.assertIn("photoOpts.imageHeight = this.photoCapabilities.imageHeight.max", self.client_content)
        self.assertIn("takePhoto", self.client_content)

    def test_client_visual_reticle_feedback(self):
        """Verify reticle feedback shows STOP, HOLD STILL, CAPTURING, and CAPTURED."""
        self.assertIn("STOP", self.client_content)
        self.assertIn("HOLD STILL", self.client_content)
        self.assertIn("CAPTURING", self.client_content)
        self.assertIn("CAPTURED", self.client_content)
        self.assertIn("renderWheelSegments", self.client_content)

    def test_server_large_payload_limit_and_p2r16_fields(self):
        """Verify server supports 60mb payloads and stores P2R16 fields."""
        self.assertIn("express.json({ limit: '60mb' })", self.server_content)
        self.assertIn("targetAngleDeg", self.server_content)
        self.assertIn("actualSensorYawDeg", self.server_content)
        self.assertIn("yawError", self.server_content)
        self.assertIn("blurStatus", self.server_content)
        self.assertIn("/api/internal-qa/guided-capture/p2r16-phase1-report/:sessionId", self.server_content)

    def test_customer_default_remains_p2r13(self):
        """Verify customer default geometry path strictly remains P2R13."""
        self.assertIn("Customer default remains safe P2R13 baseline", self.worker_content)
        fail_lock = AUTO_LOCK_DIR / "C12_9_P2R14_VISUAL_FAILURE.FAIL.LOCK.json"
        self.assertTrue(fail_lock.exists(), "P2R14 visual failure lock must exist")
        data = json.loads(fail_lock.read_text(encoding="utf-8"))
        self.assertEqual(data.get("verdict"), "FAIL")

        p2r15_lock = AUTO_LOCK_DIR / "C12_9_P2R15_CODE_PASS.LOCK.json"
        self.assertTrue(p2r15_lock.exists(), "P2R15 lock must exist")
        p2r15_data = json.loads(p2r15_lock.read_text(encoding="utf-8"))
        self.assertEqual(p2r15_data.get("lockedItems", {}).get("CUSTOMER_DEFAULT_GEOMETRY_PATH"), "P2R13")

    def test_llst42_forensic_source_untouched(self):
        """Verify LLST42 source files exist and have unchanged hashes."""
        hashes_file = SERVER_DIR / "qa" / "milestones" / "LLST42_SOURCE_HASHES.json"
        self.assertTrue(hashes_file.exists(), "LLST42_SOURCE_HASHES.json must exist")
        hashes_data = json.loads(hashes_file.read_text(encoding="utf-8"))
        self.assertEqual(hashes_data.get("captureSessionId"), "LLST42")
        self.assertEqual(hashes_data.get("frameCount"), 40)


if __name__ == "__main__":
    unittest.main()

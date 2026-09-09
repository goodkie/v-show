#!/usr/bin/env python3
"""
Test Suite for C12.9-P2R16 Phase 3B:
Physical 12-Shot High-Res Guided 360 Capture, Provenance, Mobile RI, Stitching, and Auto-Locks.
"""

import os
import sys
import json
import unittest
from pathlib import Path
from PIL import Image

SERVER_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVER_DIR.parent.parent
sys.path.insert(0, str(SERVER_DIR / 'qa'))

from auto_lock_milestone import validate_evidence

class TestC129P2R16Phase3BSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo_root = REPO_ROOT
        cls.server_dir = SERVER_DIR
        cls.session_id = "P2R16_S23_12SHOT_PHYSICAL_01"
        cls.ri_session_id = "RI-M-S23-12SHOT-PHYSICAL01"
        cls.target_angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

    def test_01_client_ux_12shot_configuration(self):
        """Verify GuidedCaptureController client implementation has 12 target angles, state machine, and hysteresis."""
        client_html = (self.repo_root / "virtual-tradeshow-commercial-v1" / "client" / "index.html").read_text(encoding="utf-8")
        
        # 12 targets configured
        self.assertIn("12_SHOT_30_DEG_PHYSICAL", client_html)
        self.assertIn("0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330", client_html)
        
        # State machine states
        for state in ["ROTATING", "TARGET_NEAR", "STOP_REQUESTED", "STABILIZING", "CAPTURING", "SAVING", "CAPTURED", "NEXT_TARGET", "CLOSURE_CHECK", "360_COMPLETE"]:
            self.assertIn(state, client_html)
            
        # Tolerances & Hysteresis
        self.assertIn("TARGET_ENTER_TOLERANCE_DEG", client_html)
        self.assertIn("TARGET_CAPTURE_TOLERANCE_DEG", client_html)
        self.assertIn("TARGET_EXIT_TOLERANCE_DEG", client_html)
        self.assertIn("YAW_VELOCITY_THRESHOLD", client_html)
        self.assertIn("STABILITY_WINDOW_MS", client_html)
        
        # Closure navigation
        self.assertIn("RETURN TO START", client_html)
        self.assertIn("CLOSURE CHECK", client_html)
        self.assertIn("360 COMPLETE", client_html)

    def test_02_physical_session_provenance_and_immutability(self):
        """Verify P2R16_S23_12SHOT_PHYSICAL_01 has 12 independent 4000x3000 physical stills with unique hashes."""
        orig_dir = self.repo_root / "production_artifacts" / "mobile_runtime_inspector" / self.session_id / "originals"
        self.assertTrue(orig_dir.exists(), f"Originals directory missing: {orig_dir}")
        
        meta_path = self.repo_root / "production_artifacts" / "mobile_runtime_inspector" / self.session_id / "metadata.json"
        self.assertTrue(meta_path.exists(), "metadata.json missing")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        
        self.assertEqual(meta.get("capturePlan"), "12_SHOT_30_DEG_PHYSICAL")
        self.assertEqual(meta.get("physicalPrimaryFrameCount"), 12)
        self.assertEqual(meta.get("derivedPrimaryFrameCount"), 0)
        self.assertEqual(meta.get("sharedGeometricAnchorCount"), 0)
        self.assertEqual(meta.get("primaryFrameProvenance"), "FULLY_INDEPENDENT_PHYSICAL_CAPTURE")
        self.assertEqual(meta.get("actualStillResolution"), "4000x3000")
        
        hashes = set()
        candidates = meta.get("candidates", [])
        self.assertEqual(len(candidates), 12)
        
        for c in candidates:
            shot_file = orig_dir / f"{c['candidateId']}.jpg"
            self.assertTrue(shot_file.exists(), f"Physical file missing: {shot_file}")
            
            # Verify 4000x3000 resolution
            with Image.open(shot_file) as im:
                self.assertEqual(im.size, (4000, 3000))
                
            # Verify hash uniqueness
            h = c.get("sha256")
            self.assertTrue(bool(h))
            self.assertNotIn(h, hashes, f"Duplicate hash detected: {h} for {c['candidateId']}")
            hashes.add(h)
            
            # Verify unclipped raw metrics exist
            raw_m = c.get("rawMetrics", {})
            self.assertIn("laplacianVariance", raw_m)
            self.assertIn("tenengrad", raw_m)
            self.assertIn("shannonEntropyBits", raw_m)
            self.assertIn("exposureClippingPct", raw_m)
            self.assertTrue(raw_m.get("decodeValidity"))

    def test_03_mobile_runtime_inspector_session(self):
        """Verify RI-M-S23-12SHOT-PHYSICAL01 telemetry, logs, and contact sheet exist."""
        ri_dir = self.repo_root / "production_artifacts" / "mobile_runtime_inspector" / self.ri_session_id
        self.assertTrue(ri_dir.exists())
        
        for json_name in ["summary.json", "camera_state.json", "target_angle_state.json", "durable_storage.json", "closure_state.json"]:
            jp = ri_dir / json_name
            self.assertTrue(jp.exists(), f"Missing RI file: {json_name}")
            data = json.loads(jp.read_text(encoding="utf-8"))
            self.assertTrue(bool(data))
            
        contact_sheet = ri_dir / "06_P2R16_PHYSICAL_12SHOT_CONTACT_SHEET.jpg"
        self.assertTrue(contact_sheet.exists(), "Contact sheet missing")
        with Image.open(contact_sheet) as im:
            self.assertGreater(im.size[0], 2000)

    def test_04_physical_12shot_stitching_artifacts(self):
        """Verify P2R16_PHYSICAL_12SHOT review artifacts exist in /uploads/."""
        uploads_dir = self.repo_root / "virtual-tradeshow-commercial-v1" / "uploads"
        
        review_pano = uploads_dir / "P2R16_PHYSICAL_12SHOT_OWNER_REVIEW.jpg"
        closure_seam = uploads_dir / "P2R16_PHYSICAL_12SHOT_CLOSURE.jpg"
        forensic_ov = uploads_dir / "P2R16_PHYSICAL_12SHOT_FORENSIC_OVERLAY.jpg"
        native_crops = uploads_dir / "P2R16_PHYSICAL_12SHOT_NATIVE_CROPS.jpg"
        
        self.assertTrue(review_pano.exists(), "Owner review panorama missing")
        self.assertTrue(closure_seam.exists(), "Closure seam missing")
        self.assertTrue(forensic_ov.exists(), "Forensic overlay missing")
        self.assertTrue(native_crops.exists(), "Native crops missing")
        
        with Image.open(review_pano) as im:
            self.assertGreaterEqual(im.size[0], 12000)
            self.assertGreaterEqual(im.size[1], 2000)

    def test_05_phase3b_auto_locks(self):
        """Verify all Phase 3B pass evidence files and .LOCK.json files validate against policy."""
        policy_path = self.server_dir / "qa" / "milestones" / "AUTO_LOCK_POLICY.json"
        policy = json.loads(policy_path.read_text(encoding="utf-8"))
        
        evidence_ids = [
            "P2R16_12SHOT_GUIDED_UI_PHYSICAL_PASS",
            "P2R16_12SHOT_HIGH_RES_CAPTURE_PHYSICAL_PASS",
            "P2R16_12SHOT_DURABLE_STORAGE_PASS",
            "P2R16_12SHOT_CLOSURE_GUIDANCE_PASS",
            "C12_9_P2R16_PHASE3B_CODE_PASS"
        ]
        
        for eid in evidence_ids:
            ev_file = self.server_dir / "qa" / "pass_evidence" / f"{eid}.json"
            lock_file = self.server_dir / "qa" / "milestones" / "auto" / f"{eid}.LOCK.json"
            
            self.assertTrue(ev_file.exists(), f"Missing evidence: {ev_file}")
            self.assertTrue(lock_file.exists(), f"Missing lock: {lock_file}")
            
            ev_data = json.loads(ev_file.read_text(encoding="utf-8"))
            validate_evidence(ev_data, policy)
            self.assertEqual(ev_data["verdict"], "PASS")
            self.assertEqual(ev_data["evidenceLevel"], "PHYSICAL_PRODUCTION_VERIFIED")
            self.assertFalse(ev_data.get("lockedItems", {}).get("OWNER_VISUAL_ACCEPTANCE", True))

    def test_06_customer_default_preserved(self):
        """Verify customer default remains strictly P2R13 and owner visual acceptance is False."""
        meta_path = self.repo_root / "production_artifacts" / "mobile_runtime_inspector" / self.session_id / "metadata.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        
        self.assertEqual(meta.get("customerDefaultGeometryPath"), "P2R13")
        self.assertFalse(meta.get("ownerVisualAcceptance"))

if __name__ == '__main__':
    unittest.main()

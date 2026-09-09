#!/usr/bin/env python3
"""
Test Suite for C12.9-P2R16 Phase 4:
Portrait-Only True Physical High-Res Guided 360 Capture, Mobile RI Session,
Orientation Decoupling, Durable Source Immutability, and Auto-Locks.
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

class TestC129P2R16Phase4Suite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo_root = REPO_ROOT
        cls.server_dir = SERVER_DIR
        cls.session_id = "P2R16_S23_PORTRAIT_12SHOT_PHYSICAL_01"
        cls.ri_session_id = "RI-M-P2R16-PORTRAIT12-01"
        cls.target_angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

    def test_01_client_ux_portrait_only_configuration(self):
        """Verify GuidedCaptureController client implementation has PORTRAIT_ONLY gating, 12 target angles, roll monitoring, and camera position cues."""
        client_html = (self.repo_root / "virtual-tradeshow-commercial-v1" / "client" / "index.html").read_text(encoding="utf-8")
        
        # Portrait policy
        self.assertIn("GUIDED_360_CAPTURE_ORIENTATION = 'PORTRAIT_ONLY'", client_html)
        self.assertIn("PRIMARY_CAPTURE_PLAN = '12_SHOT_30_DEG_PORTRAIT'", client_html)
        self.assertIn("12_SHOT_30_DEG_PORTRAIT", client_html)
        self.assertIn("0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330", client_html)
        
        # Orientation & Roll gating
        self.assertIn("checkOrientation", client_html)
        self.assertIn("PORTRAIT_ROLL_WARNING", client_html)
        self.assertIn("ROTATE_PHONE_VERTICALLY", client_html)
        self.assertIn("Hold your phone vertically", client_html)
        self.assertIn("Rotate your phone back to vertical", client_html)
        self.assertIn("Keep phone upright", client_html)
        
        # Camera position guidance cues
        self.assertIn("Keep the camera in the same spot as you turn.", client_html)
        self.assertIn("Rotate around the phone, not around your body.", client_html)

    def test_02_physical_portrait_session_provenance_and_immutability(self):
        """Verify P2R16_S23_PORTRAIT_12SHOT_PHYSICAL_01 has 12 independent physical stills with EXIF 6 and unique hashes."""
        orig_dir = self.repo_root / "production_artifacts" / "mobile_runtime_inspector" / self.session_id / "ORIGINAL"
        norm_dir = self.repo_root / "production_artifacts" / "mobile_runtime_inspector" / self.session_id / "DERIVED_ORIENTATION_NORMALIZED"
        self.assertTrue(orig_dir.exists(), f"Originals directory missing: {orig_dir}")
        self.assertTrue(norm_dir.exists(), f"Normalized directory missing: {norm_dir}")
        
        meta_path = self.repo_root / "production_artifacts" / "mobile_runtime_inspector" / self.session_id / "metadata.json"
        self.assertTrue(meta_path.exists(), "metadata.json missing")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        
        self.assertEqual(meta.get("captureOrientation"), "PORTRAIT_ONLY")
        self.assertEqual(meta.get("primaryCapturePlan"), "12_SHOT_30_DEG_PORTRAIT")
        prov = meta.get("provenance", {})
        self.assertEqual(prov.get("physicalPrimaryFrameCount"), 12)
        self.assertEqual(prov.get("derivedFrameCount"), 0)
        self.assertEqual(prov.get("reusedFrameCount"), 0)
        self.assertEqual(prov.get("llst42FrameCount"), 0)
        self.assertEqual(prov.get("uniqueHashCount"), 12)
        
        candidates = meta.get("candidates", [])
        self.assertEqual(len(candidates), 12)
        
        seen_hashes = set()
        for idx, deg in enumerate(self.target_angles):
            c = candidates[idx]
            self.assertEqual(c["targetYawDeg"], deg)
            self.assertEqual(c["devicePhysicalOrientation"], "PORTRAIT")
            self.assertEqual(c["screenOrientation"], "portrait-primary")
            self.assertEqual(c["encodedDimensions"], "4000x3000")
            self.assertEqual(c["exifOrientation"], 6)
            self.assertEqual(c["normalizedDimensions"], "3000x4000")
            self.assertLessEqual(abs(c["yawErrorDeg"]), 1.5)
            self.assertLessEqual(abs(c["deviceRollDeg"]), 3.0)
            
            orig_file = orig_dir / f"SHOT_{deg:03d}.jpg"
            norm_file = norm_dir / f"SHOT_{deg:03d}.jpg"
            self.assertTrue(orig_file.exists(), f"Missing original: {orig_file}")
            self.assertTrue(norm_file.exists(), f"Missing normalized: {norm_file}")
            
            # Inspect original JPEG dimensions and EXIF
            with Image.open(orig_file) as im_orig:
                self.assertEqual(im_orig.size, (4000, 3000), "Original encoded dimensions must be 4000x3000")
                exif = im_orig.getexif()
                self.assertEqual(exif.get(0x0112), 6, "EXIF Orientation tag must be 6 (Rotate 90 CW)")
                
            # Inspect normalized JPEG dimensions
            with Image.open(norm_file) as im_norm:
                self.assertEqual(im_norm.size, (3000, 4000), "Normalized dimensions must be 3000x4000")
                
            h = c["sha256"]
            self.assertNotIn(h, seen_hashes, f"Duplicate SHA-256 hash detected: {h}")
            seen_hashes.add(h)

    def test_03_portrait_optics_and_overlap_measurement(self):
        """Verify portrait FOV and horizontal overlap calculations."""
        meta_path = self.repo_root / "production_artifacts" / "mobile_runtime_inspector" / self.session_id / "metadata.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        intr = meta.get("cameraIntrinsics", {})
        
        self.assertEqual(intr.get("portraitHorizontalFovDeg"), 53.67)
        self.assertEqual(intr.get("portraitVerticalFovDeg"), 68.00)
        self.assertEqual(intr.get("expectedHorizontalOverlapDeg"), 23.67)
        self.assertEqual(intr.get("expectedHorizontalOverlapPercent"), 44.10)

    def test_04_mobile_ri_session_telemetry_and_contact_sheet(self):
        """Verify Mobile RI session artifacts, event chain, and contact sheet."""
        ri_dir = self.repo_root / "production_artifacts" / "mobile_runtime_inspector" / self.ri_session_id
        self.assertTrue(ri_dir.exists(), f"Mobile RI directory missing: {ri_dir}")
        
        for f in ["summary.json", "camera_state.json", "target_angle_state.json", "durable_storage.json", "closure_state.json", "event_log.json", "P2R16_PORTRAIT_12SHOT_PHYSICAL_CONTACT_SHEET.jpg"]:
            p = ri_dir / f
            self.assertTrue(p.exists(), f"Missing RI file: {f}")
            
        summary = json.loads((ri_dir / "summary.json").read_text(encoding="utf-8"))
        self.assertEqual(summary["verdicts"]["portraitOnlyCapturePass"], "PASS")
        self.assertEqual(summary["verdicts"]["angleGuidancePhysicalPass"], "PASS")
        self.assertEqual(summary["verdicts"]["highResStillCapturePass"], "PASS")
        self.assertEqual(summary["verdicts"]["durableStoragePass"], "PASS")
        self.assertEqual(summary["verdicts"]["closureNavigationPass"], "PASS")
        
        # Verify event log contains all 8 event steps per shot
        events = json.loads((ri_dir / "event_log.json").read_text(encoding="utf-8"))
        event_names = [e["event"] for e in events]
        for ev in ["TARGET_ENTERED", "PORTRAIT_ORIENTATION_CONFIRMED", "STABILITY_ACHIEVED", "IMAGECAPTURE_TAKEPHOTO_INVOKED", "JPEG_RETURNED", "ORIGINAL_BYTES_ARCHIVED", "SHA256_COMPUTED", "DURABLE_WRITE_COMPLETED"]:
            self.assertIn(ev, event_names)
        self.assertIn("CLOSURE_VERIFIED", event_names)

    def test_05_auto_locks_validation_and_customer_default_invariant(self):
        """Verify Phase 4 auto-locks pass validation under AUTO_LOCK_POLICY.json and customer default remains P2R13."""
        policy = json.loads((self.server_dir / "qa" / "milestones" / "AUTO_LOCK_POLICY.json").read_text(encoding="utf-8"))
        
        phase4_locks = [
            "P2R16_PORTRAIT_ONLY_GUIDE_PHYSICAL_PASS",
            "P2R16_PORTRAIT_12SHOT_IMAGECAPTURE_PASS",
            "P2R16_PORTRAIT_12SHOT_DURABLE_SOURCE_PASS",
            "P2R16_PORTRAIT_12SHOT_CLOSURE_GUIDANCE_PASS",
            "C12_9_P2R16_PHASE4_CODE_PASS"
        ]
        
        for lock_id in phase4_locks:
            ev_file = self.server_dir / "qa" / "pass_evidence" / f"{lock_id}.json"
            lock_file = self.server_dir / "qa" / "milestones" / "auto" / f"{lock_id}.LOCK.json"
            self.assertTrue(ev_file.exists(), f"Evidence file missing: {ev_file}")
            self.assertTrue(lock_file.exists(), f"Lock file missing: {lock_file}")
            
            ev_data = json.loads(ev_file.read_text(encoding="utf-8"))
            validate_evidence(ev_data, policy)
            
            self.assertEqual(ev_data["verdict"], "PASS")
            self.assertEqual(ev_data["evidenceLevel"], "PHYSICAL_PRODUCTION_VERIFIED")
            self.assertEqual(ev_data["lockedItems"]["CUSTOMER_DEFAULT_GEOMETRY_PATH"], "P2R13")
            self.assertFalse(ev_data["lockedItems"]["OWNER_VISUAL_ACCEPTANCE"])

if __name__ == "__main__":
    unittest.main()

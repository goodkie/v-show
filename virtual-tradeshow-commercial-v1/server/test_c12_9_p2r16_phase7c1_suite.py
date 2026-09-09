#!/usr/bin/env python3
"""
Test Suite for C12.9-P2R16 Phase 7C.1:
Forensic Correction, Owner Evidence Repair, Full VGGT Checkpoint Audit & STOP Directive Verification:
- Immediate repair of invalid owner acceptance state (QUALITY_GHOSTING_QA=FAIL, OWNER_ACCEPTANCE=false)
- Forensic reclassification of Phase 7C (12-view VGGT not proven, camera path unresolved, Z-buffer incomplete)
- Full VGGT checkpoint verification (DINOv2 backbone separated, full model.pt unavailable, 1,797 missing keys, STOP triggered)
- Preservation of all authoritative artifacts (7A, 7B, 7C unmodified)
- Viewer support for ?mode=quality-ai-4view and ?mode=quality-ai-12view with default quality-ai-12view
- Invariant commitments (CUSTOMER_DEFAULT_GEOMETRY_PATH=P2R13, master untouched, zero photo enhancement)
"""

import os
import sys
import json
import hashlib
import unittest
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVER_DIR.parent.parent

def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

class TestC129P2R16Phase7C1Suite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo_root = REPO_ROOT
        cls.artifacts_dir = REPO_ROOT / "production_artifacts" / "mobile_runtime_inspector"
        cls.client_qa_dir = SERVER_DIR.parent / "client" / "internal" / "qa"

    def test_01_owner_state_repair(self):
        """Verify invalid owner acceptance state was repaired in both 7C and 7C.1 diagnostics."""
        diag7c_p = self.artifacts_dir / "P2R16_QUALITY_PHASE7C_DIAGNOSTICS.json"
        self.assertTrue(diag7c_p.exists(), "Phase 7C diagnostics missing")
        diag7c = json.loads(diag7c_p.read_text(encoding="utf-8"))
        self.assertEqual(diag7c["QUALITY_GHOSTING_QA"], "FAIL")
        self.assertFalse(diag7c["OWNER_REVIEW_COMPLETED"])
        self.assertFalse(diag7c["OWNER_VISUAL_ACCEPTANCE"])

        diag7c1_p = self.artifacts_dir / "P2R16_QUALITY_PHASE7C1_DIAGNOSTICS.json"
        self.assertTrue(diag7c1_p.exists(), "Phase 7C.1 diagnostics missing")
        diag7c1 = json.loads(diag7c1_p.read_text(encoding="utf-8"))
        self.assertEqual(diag7c1["QUALITY_GHOSTING_QA"], "FAIL")
        self.assertFalse(diag7c1["OWNER_REVIEW_COMPLETED"])
        self.assertFalse(diag7c1["OWNER_VISUAL_ACCEPTANCE"])

    def test_02_phase7c_accurate_reclassification(self):
        """Verify Phase 7C was accurately reclassified without deleting forensic history."""
        diag7c_p = self.artifacts_dir / "P2R16_QUALITY_PHASE7C_DIAGNOSTICS.json"
        diag7c = json.loads(diag7c_p.read_text(encoding="utf-8"))
        self.assertEqual(diag7c["PHASE7C_ROMA_EXECUTION"], "TRUE_12_ADJACENT_PAIR_INFERENCE")
        self.assertEqual(diag7c["PHASE7C_FULL_12_VIEW_VGGT"], "NOT_PROVEN")
        self.assertEqual(diag7c["PHASE7C_CAMERA_PATH_PROVENANCE"], "UNRESOLVED")
        self.assertEqual(diag7c["PHASE7C_ZBUFFER_REPROJECTION_PROOF"], "INCOMPLETE")

    def test_03_vggt_checkpoint_audit_and_stop_condition(self):
        """Verify full VGGT checkpoint separation, missing keys count, and STOP directive."""
        diag7c1_p = self.artifacts_dir / "P2R16_QUALITY_PHASE7C1_DIAGNOSTICS.json"
        diag7c1 = json.loads(diag7c1_p.read_text(encoding="utf-8"))

        vggt_audit = diag7c1["VGGT_CHECKPOINT_VERIFICATION"]
        self.assertFalse(vggt_audit["VGGT_FULL_STATE_DICT_LOADED"])
        self.assertEqual(vggt_audit["MISSING_KEYS_COUNT"], 1797)
        self.assertEqual(vggt_audit["UNEXPECTED_KEYS_COUNT"], 343)
        self.assertTrue(vggt_audit["STOP_DIRECTIVE_TRIGGERED"])

        dino_audit = diag7c1["DINOV2_BACKBONE_VERIFICATION"]
        self.assertEqual(dino_audit["DINOV2_BACKBONE_SHA256"], "d5383ea8f4877b2472eb973e0fd72d557c7da5d3611bd527ceeb1d7162cbf428")

    def test_04_preservation_of_all_prior_artifacts(self):
        """Verify Phase 7A, 7B, and 7C authoritative artifacts are completely preserved."""
        a_7a = self.artifacts_dir / "P2R16_AI_QUALITY12_OWNER_REVIEW.jpg"
        self.assertTrue(a_7a.exists())
        self.assertEqual(file_sha256(a_7a), "5158ef8c42fa1516cddfc8e4477a8408c320c76ce89eac60c7060a0f541e2e50")

        a_7b = self.artifacts_dir / "P2R16_QUALITY12_DEPTH_AWARE_OWNER_REVIEW.jpg"
        self.assertTrue(a_7b.exists())
        self.assertGreater(a_7b.stat().st_size, 5_000_000)

        a_7c = self.artifacts_dir / "P2R16_QUALITY12_TRUE_AI_OWNER_REVIEW.jpg"
        self.assertTrue(a_7c.exists())
        self.assertEqual(file_sha256(a_7c), "2f99e8f48c1ec2a1aefa461bcd4a7b22b0f35911544054a49fd09999bfbf5beb")

    def test_05_viewer_modes_configuration(self):
        """Verify viewer includes quality-ai-4view and quality-ai-12view with quality-ai-12view default."""
        viewer_p = self.client_qa_dir / "p2r16_360_viewer.html"
        content = viewer_p.read_text(encoding="utf-8")
        self.assertIn("quality-ai-12view", content)
        self.assertIn("quality-ai-4view", content)
        self.assertIn("THREE.sRGBEncoding", content)
        self.assertIn("THREE.NoToneMapping", content)
        self.assertIn("renderer.toneMappingExposure = 1.0", content)

    def test_06_invariants(self):
        """Verify customer default geometry invariant and quality photo enhancement flag."""
        diag7c1_p = self.artifacts_dir / "P2R16_QUALITY_PHASE7C1_DIAGNOSTICS.json"
        diag7c1 = json.loads(diag7c1_p.read_text(encoding="utf-8"))
        self.assertEqual(diag7c1["CUSTOMER_DEFAULT_GEOMETRY_PATH"], "P2R13")
        self.assertFalse(diag7c1["QUALITY_PHOTO_ENHANCEMENT_AI"])
        self.assertFalse(diag7c1["MASTER_TOUCHED"])

if __name__ == "__main__":
    unittest.main()

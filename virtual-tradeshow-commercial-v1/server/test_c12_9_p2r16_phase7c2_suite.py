#!/usr/bin/env python3
"""
Test Suite for C12.9-P2R16 Phase 7C.2:
True Commercial VGGT 12-View GPU Execution Gates & Viewer Placeholder Audit:
- Gated Commercial Model Access Gate (facebook/VGGT-1B-Commercial requires authorized HF_TOKEN)
- Modal L40S GPU Authentication Gate (MODAL_AUTH_PRESENT=false -> BLOCKED_MODAL_GPU_AUTH)
- Explicit QA Placeholder for 12-view mode ("12-View Commercial VGGT result not generated yet")
- Default internal viewer temporarily quality-ai-4view
- Strict preservation of prior artifacts (7A, 7B, 7C)
- Invariant commitments (CUSTOMER_DEFAULT_GEOMETRY_PATH=P2R13, master untouched, zero photo enhancement)
- Authoritative negative owner rejection invariants preserved (QUALITY_GHOSTING_QA=FAIL, OWNER_ACCEPTANCE=false)
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

class TestC129P2R16Phase7C2Suite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo_root = REPO_ROOT
        cls.artifacts_dir = REPO_ROOT / "production_artifacts" / "mobile_runtime_inspector"
        cls.client_qa_dir = SERVER_DIR.parent / "client" / "internal" / "qa"

    def test_01_commercial_access_gate(self):
        """Verify gated commercial repo access check and BLOCKED_COMMERCIAL_MODEL_ACCESS status."""
        diag7c2_p = self.artifacts_dir / "P2R16_QUALITY_PHASE7C2_DIAGNOSTICS.json"
        self.assertTrue(diag7c2_p.exists(), "Phase 7C.2 diagnostics missing")
        diag7c2 = json.loads(diag7c2_p.read_text(encoding="utf-8"))

        self.assertEqual(diag7c2["COMMERCIAL_VGGT_REPO"], "facebook/VGGT-1B-Commercial")
        self.assertFalse(diag7c2["COMMERCIAL_MODEL_ACCESS_GRANTED"])
        self.assertFalse(diag7c2["HF_AUTH_PRESENT"])
        self.assertEqual(diag7c2["GATE_EVALUATION"]["SECTION_4_ACCESS_GATE"], "BLOCKED_COMMERCIAL_MODEL_ACCESS")

    def test_02_modal_gpu_auth_gate(self):
        """Verify Modal authentication check and BLOCKED_MODAL_GPU_AUTH status."""
        diag7c2_p = self.artifacts_dir / "P2R16_QUALITY_PHASE7C2_DIAGNOSTICS.json"
        diag7c2 = json.loads(diag7c2_p.read_text(encoding="utf-8"))

        self.assertFalse(diag7c2["MODAL_AUTH_PRESENT"])
        self.assertIsNone(diag7c2["MODAL_WORKSPACE_RESOLVED"])
        self.assertEqual(diag7c2["GATE_EVALUATION"]["SECTION_5_MODAL_GATE"], "BLOCKED_MODAL_GPU_AUTH")

    def test_03_viewer_placeholder_and_default(self):
        """Verify viewer displays explicit placeholder for 12-view mode and defaults to 4-view."""
        viewer_p = self.client_qa_dir / "p2r16_360_viewer.html"
        content = viewer_p.read_text(encoding="utf-8")

        self.assertIn("12-View Commercial VGGT result not generated yet", content)
        self.assertIn("qa-placeholder-overlay", content)
        self.assertIn("createPlaceholderTexture", content)
        self.assertIn("quality-ai-4view", content)
        self.assertIn("THREE.sRGBEncoding", content)
        self.assertIn("THREE.NoToneMapping", content)
        self.assertIn("renderer.toneMappingExposure = 1.0", content)

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

    def test_05_invariants(self):
        """Verify invariants: customer default geometry P2R13, master untouched, negative rejection."""
        diag7c2_p = self.artifacts_dir / "P2R16_QUALITY_PHASE7C2_DIAGNOSTICS.json"
        diag7c2 = json.loads(diag7c2_p.read_text(encoding="utf-8"))

        self.assertEqual(diag7c2["CUSTOMER_DEFAULT_GEOMETRY_PATH"], "P2R13")
        self.assertFalse(diag7c2["QUALITY_PHOTO_ENHANCEMENT_AI"])
        self.assertFalse(diag7c2["MASTER_TOUCHED"])
        self.assertEqual(diag7c2["QUALITY_GHOSTING_QA"], "FAIL")
        self.assertFalse(diag7c2["OWNER_REVIEW_COMPLETED"])
        self.assertFalse(diag7c2["OWNER_VISUAL_ACCEPTANCE"])

if __name__ == "__main__":
    unittest.main()

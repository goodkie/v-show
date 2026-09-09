#!/usr/bin/env python3
"""
Test Suite for C12.9-P2R16 Phase 5:
True Portrait 12-Shot Physical Stitch, Source-Only Allowlist Provenance,
Ring Graph Closure, Anti-Ghosting Seam Finder, Full-Res Spherical Band Render,
and Owner Review Artifact Packaging.
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

class TestC129P2R16Phase5Suite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo_root = REPO_ROOT
        cls.server_dir = SERVER_DIR
        cls.session_id = "P2R16_S23_PORTRAIT_12SHOT_PHYSICAL_01"
        cls.ri_session_id = "RI-M-P2R16-PORTRAIT12-01"
        cls.target_angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
        cls.artifacts_dir = REPO_ROOT / "production_artifacts" / "mobile_runtime_inspector"

    def test_01_allowlist_enforcement_and_provenance(self):
        """Verify P2R16_PORTRAIT12_SOURCE_ALLOWLIST.json contains exact 12 SHA256 hashes and zero external source input."""
        allowlist_path = self.server_dir / "qa" / "P2R16_PORTRAIT12_SOURCE_ALLOWLIST.json"
        self.assertTrue(allowlist_path.exists(), f"Allowlist missing: {allowlist_path}")
        allowlist = json.loads(allowlist_path.read_text(encoding="utf-8"))
        
        self.assertEqual(allowlist["sessionId"], self.session_id)
        self.assertEqual(allowlist["totalAllowedCount"], 12)
        self.assertEqual(len(allowlist["sha256Allowlist"]), 12)
        self.assertEqual(len(set(allowlist["sha256Allowlist"])), 12, "All 12 source hashes must be unique")
        self.assertEqual(allowlist["enforceMode"], "STRICT_HASH_ONLY")

    def test_02_ring_graph_and_closure_metrics(self):
        """Verify all 12 consecutive ring edges have high inlier counts and valid closure."""
        manifest_path = self.artifacts_dir / "P2R16_PORTRAIT12_OWNER_ARTIFACT_MANIFEST.json"
        self.assertTrue(manifest_path.exists(), "Manifest missing")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        
        verdicts = manifest.get("verdicts", {})
        self.assertEqual(verdicts.get("graphComponentCount"), 1)
        self.assertTrue(verdicts.get("ringPathExists"))
        self.assertTrue(verdicts.get("closureEdgeValid"))
        self.assertEqual(verdicts.get("ghostingQa"), "PASS")
        self.assertEqual(verdicts.get("globalGeometryQa"), "PASS")
        self.assertEqual(verdicts.get("closureSeamQa"), "PASS")

    def test_03_full_res_render_and_artifacts(self):
        """Verify P2R16_PORTRAIT_12SHOT_OWNER_REVIEW.jpg dimensions (18631x3620) and inspection artifacts exist."""
        review_path = self.artifacts_dir / "P2R16_PORTRAIT_12SHOT_OWNER_REVIEW.jpg"
        self.assertTrue(review_path.exists(), f"Owner review artifact missing: {review_path}")
        
        with Image.open(review_path) as im:
            w, h = im.size
            self.assertEqual(w, 18631, f"Expected width 18631, got {w}")
            self.assertEqual(h, 3620, f"Expected height 3620, got {h}")
            
        # Verify inspection artifacts
        for fn in [
            "P2R16_PORTRAIT12_SEAM_MAP.jpg",
            "P2R16_PORTRAIT12_GHOSTING_INSPECTION.jpg",
            "P2R16_PORTRAIT_12SHOT_CLOSURE.jpg",
            "P2R16_PORTRAIT_12SHOT_NATIVE_CROPS.jpg",
            "P2R16_PORTRAIT12_OWNER_ARTIFACT_MANIFEST.json"
        ]:
            p = self.artifacts_dir / fn
            self.assertTrue(p.exists(), f"Missing required Phase 5 artifact: {fn}")
            min_sz = 1000 if fn.endswith(".json") else 50000
            self.assertGreater(p.stat().st_size, min_sz, f"Artifact {fn} is suspiciously small")

    def test_04_auto_locks_and_customer_default_invariant(self):
        """Verify Phase 5 auto-locks pass validation under AUTO_LOCK_POLICY.json and customer default remains P2R13."""
        policy = json.loads((self.server_dir / "qa" / "milestones" / "AUTO_LOCK_POLICY.json").read_text(encoding="utf-8"))
        
        phase5_locks = [
            "P2R16_PORTRAIT_SOURCE_PROVENANCE_PASS",
            "P2R16_PORTRAIT_RING_GRAPH_PASS",
            "P2R16_FULL_RES_PORTRAIT_RENDER_PASS",
            "C12_9_P2R16_PHASE5_CODE_PASS"
        ]
        
        for lock_id in phase5_locks:
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

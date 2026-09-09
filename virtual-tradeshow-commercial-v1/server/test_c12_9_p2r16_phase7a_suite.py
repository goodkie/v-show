#!/usr/bin/env python3
"""
Test Suite for C12.9-P2R16 Phase 7A:
Real Internal 360 Viewer, Spherical Band Geometry, Quality/Easy A-B Switch,
WebGL Safe Texture Proxies, and Owner Evidence Records.
"""

import os
import sys
import json
import hashlib
import unittest
from pathlib import Path
from PIL import Image

SERVER_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVER_DIR.parent.parent
sys.path.insert(0, str(SERVER_DIR / "qa"))

from auto_lock_milestone import validate_evidence

def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

class TestC129P2R16Phase7ASuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo_root = REPO_ROOT
        cls.server_dir = SERVER_DIR
        cls.qa_dir = SERVER_DIR / "qa"
        cls.artifacts_dir = REPO_ROOT / "production_artifacts" / "mobile_runtime_inspector"
        cls.viewer_proxies_dir = cls.artifacts_dir / "viewer_proxies"
        cls.policy = json.loads((cls.qa_dir / "milestones" / "AUTO_LOCK_POLICY.json").read_text(encoding="utf-8"))

    def test_01_owner_verdicts_recorded(self):
        """Verify Owner evidence and preference recorded in lock file."""
        lock_p = self.qa_dir / "milestones" / "auto" / "P2R16_PHASE7A_OWNER_EVIDENCE_RECORD.LOCK.json"
        self.assertTrue(lock_p.exists(), "Owner evidence lock missing")
        data = json.loads(lock_p.read_text(encoding="utf-8"))

        items = data["lockedItems"]
        self.assertTrue(items["OWNER_REVIEW_COMPLETED"])
        self.assertFalse(items["OWNER_VISUAL_ACCEPTANCE_EASY"])
        self.assertFalse(items["OWNER_VISUAL_ACCEPTANCE_QUALITY"])
        self.assertEqual(items["EASY_GHOSTING_QA"], "FAIL")
        self.assertEqual(items["QUALITY_GHOSTING_QA"], "FAIL")
        self.assertEqual(items["QUALITY_RELATIVE_VISUAL_PREFERENCE"], "MUCH_MORE_NATURAL_THAN_EASY")
        self.assertEqual(items["BEST_ACCEPTED_COMMERCIAL_PLAN"], "UNRESOLVED")
        self.assertEqual(items["QUALITY_360"], "CURRENT_PREFERRED_EXPERIMENTAL_CANDIDATE")
        self.assertEqual(items["CUSTOMER_DEFAULT_GEOMETRY_PATH"], "P2R13")

    def test_02_authoritative_artifacts_integrity(self):
        """Verify authoritative Phase 6 artifacts remain unaltered with exact cryptographic hashes."""
        quality_p = self.artifacts_dir / "P2R16_AI_QUALITY12_OWNER_REVIEW.jpg"
        easy_p = self.artifacts_dir / "P2R16_AI_CONTINUOUS_OWNER_REVIEW.jpg"

        self.assertTrue(quality_p.exists(), "Quality artifact missing")
        self.assertTrue(easy_p.exists(), "Easy artifact missing")

        quality_sha = file_sha256(quality_p)
        easy_sha = file_sha256(easy_p)

        self.assertEqual(quality_sha, "5158ef8c42fa1516cddfc8e4477a8408c320c76ce89eac60c7060a0f541e2e50")
        self.assertEqual(easy_sha, "589daa909741cc71a94647282b25420fde0de602b77ed837dcc5e4e99164ba7e")

        with Image.open(quality_p) as im:
            self.assertEqual(im.size, (18631, 3620))
        with Image.open(easy_p) as im:
            self.assertEqual(im.size, (18631, 3620))

    def test_03_viewer_proxies_generated_and_aspect_ratio(self):
        """Verify WebGL-safe proxies (2048, 4096, 8192) exist and preserve aspect ratio."""
        expected_widths = [2048, 4096, 8192]
        orig_aspect = 18631.0 / 3620.0

        for mode in ["quality", "easy"]:
            for w in expected_widths:
                p = self.viewer_proxies_dir / f"{mode}-{w}.jpg"
                self.assertTrue(p.exists(), f"Missing proxy: {p}")
                with Image.open(p) as im:
                    pw, ph = im.size
                    self.assertEqual(pw, w)
                    aspect = pw / float(ph)
                    self.assertAlmostEqual(aspect, orig_aspect, delta=0.05)

        # Verify proxy manifest
        manifest_p = self.viewer_proxies_dir / "proxy_manifest.json"
        self.assertTrue(manifest_p.exists(), "Proxy manifest missing")
        manifest = json.loads(manifest_p.read_text(encoding="utf-8"))
        self.assertTrue(manifest["VIEWER_ONLY_DERIVATIVE"])
        self.assertFalse(manifest["OWNER_ACCEPTANCE_ARTIFACT"])

    def test_04_uv_projection_fixture_and_geometry(self):
        """Verify synthetic UV grid fixture exists and represents 360x68 spherical band."""
        uv_grid_p = self.artifacts_dir / "P2R16_SPHERICAL_BAND_UV_GRID.jpg"
        self.assertTrue(uv_grid_p.exists(), "UV grid fixture missing")
        with Image.open(uv_grid_p) as im:
            self.assertEqual(im.size, (4096, 796))

    def test_05_viewer_html_and_routing(self):
        """Verify p2r16_360_viewer.html features and server route registration."""
        viewer_html_p = self.server_dir.parent / "client" / "internal" / "qa" / "p2r16_360_viewer.html"
        self.assertTrue(viewer_html_p.exists(), "Viewer HTML missing")
        html = viewer_html_p.read_text(encoding="utf-8")

        # Three.js & Geometry
        self.assertIn("THREE.SphereGeometry", html)
        self.assertIn("vaovDeg: 68", html)
        self.assertIn("minPitchDeg: -34", html)
        self.assertIn("maxPitchDeg: 34", html)

        # Capability detection
        self.assertIn("MAX_TEXTURE_SIZE", html)

        # Mode switching & Hotkeys
        self.assertIn("switchMode('quality')", html)
        self.assertIn("switchMode('easy')", html)
        self.assertIn("e.key === 'q'", html)
        self.assertIn("e.key === 'e'", html)

        # Server routes
        server_js_p = self.server_dir / "index.js"
        server_code = server_js_p.read_text(encoding="utf-8")
        self.assertIn("app.get('/internal/qa/p2r16/360-viewer'", server_code)
        self.assertIn("app.use('/internal-assets/p2r16/viewer'", server_code)

    def test_06_invariants_and_auto_locks(self):
        """Verify Phase 7A auto-locks pass validation under AUTO_LOCK_POLICY.json and P2R13 customer default preserved."""
        phase7a_locks = [
            "P2R16_REAL_INTERNAL_360_VIEWER_PASS",
            "P2R16_PHASE7A_OWNER_EVIDENCE_RECORD",
            "C12_9_P2R16_PHASE7A_CODE_PASS"
        ]

        for lock_id in phase7a_locks:
            ev_file = self.qa_dir / "pass_evidence" / f"{lock_id}.json"
            lock_file = self.qa_dir / "milestones" / "auto" / f"{lock_id}.LOCK.json"
            self.assertTrue(ev_file.exists(), f"Evidence file missing: {ev_file}")
            self.assertTrue(lock_file.exists(), f"Lock file missing: {lock_file}")

            ev_data = json.loads(ev_file.read_text(encoding="utf-8"))
            validate_evidence(ev_data, self.policy)

if __name__ == "__main__":
    unittest.main()

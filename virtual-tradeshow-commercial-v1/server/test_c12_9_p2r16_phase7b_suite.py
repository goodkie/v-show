#!/usr/bin/env python3
"""
Test Suite for C12.9-P2R16 Phase 7B:
Quality 360 Depth-Aware Parallax Correction:
- Preservation of Phase 7A.1 viewer color/exposure fix
- Preservation of Phase 6 Authoritative Quality Artifact (unmodified)
- True Camera Translation Modeling & Optical Center Positions
- Depth-Aware Reprojection & Single-Source Occlusion-Aware Ownership
- Complete Diagnostic Inspection Suite (Seam Map, Camera Path, Ghosting Inspection, Comparison)
- 3-Mode Viewer (quality-depth, quality-current, easy) & Hotkeys (D, Q, E)
- WebGL-safe Proxy Generation (2048, 4096, 8192)
- Cost Telemetry <= $0.05
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

def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

class TestC129P2R16Phase7BSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo_root = REPO_ROOT
        cls.server_dir = SERVER_DIR
        cls.qa_dir = SERVER_DIR / "qa"
        cls.artifacts_dir = REPO_ROOT / "production_artifacts" / "mobile_runtime_inspector"
        cls.client_qa_dir = SERVER_DIR.parent / "client" / "internal" / "qa"
        cls.assets_viewer_dir = SERVER_DIR.parent / "client" / "internal-assets" / "p2r16" / "viewer"

    def test_01_allowlist_and_source_audit(self):
        """Verify all 12 physical portrait stills strictly match SHA256 allowlist."""
        allowlist_p = self.artifacts_dir / "P2R16_PORTRAIT12_SOURCE_ALLOWLIST.json"
        self.assertTrue(allowlist_p.exists(), "Allowlist missing")
        allowlist = json.loads(allowlist_p.read_text(encoding="utf-8"))
        allowed = set(allowlist["sha256Allowlist"])

        shots_dir = self.artifacts_dir / "P2R16_S23_PORTRAIT_12SHOT_PHYSICAL_01" / "ORIGINAL"
        self.assertTrue(shots_dir.exists(), "Original physical stills directory missing")

        for angle in range(0, 360, 30):
            fn = f"SHOT_{angle:03d}.jpg"
            fp = shots_dir / fn
            self.assertTrue(fp.exists(), f"Missing still: {fn}")
            sha = file_sha256(fp)
            self.assertIn(sha, allowed, f"Still {fn} SHA256 mismatch against allowlist")

    def test_02_preservation_of_base_artifacts(self):
        """Verify P2R16_AI_QUALITY12_OWNER_REVIEW.jpg is unaltered and P2R13 default preserved."""
        cur_p = self.artifacts_dir / "P2R16_AI_QUALITY12_OWNER_REVIEW.jpg"
        self.assertTrue(cur_p.exists(), "Current Quality artifact missing")
        cur_sha = file_sha256(cur_p)
        self.assertEqual(cur_sha, "5158ef8c42fa1516cddfc8e4477a8408c320c76ce89eac60c7060a0f541e2e50",
                         "CRITICAL: P2R16_AI_QUALITY12_OWNER_REVIEW.jpg must NOT be overwritten!")

    def test_03_depth_aware_authoritative_panorama(self):
        """Verify P2R16_QUALITY12_DEPTH_AWARE_OWNER_REVIEW.jpg exists and matches 18631x3620."""
        dep_p = self.artifacts_dir / "P2R16_QUALITY12_DEPTH_AWARE_OWNER_REVIEW.jpg"
        self.assertTrue(dep_p.exists(), "Depth-aware panorama missing")
        self.assertGreater(dep_p.stat().st_size, 5_000_000, "Depth-aware panorama file too small")

        with Image.open(dep_p) as im:
            self.assertEqual(im.size, (18631, 3620), "Dimensions must match exact canvas (18631 x 3620)")

    def test_04_diagnostic_inspection_artifacts(self):
        """Verify all 4 inspection artifacts and diagnostics JSON exist."""
        artifacts = [
            "P2R16_QUALITY_CURRENT_VS_DEPTH_AWARE.jpg",
            "P2R16_QUALITY_DEPTH_GHOSTING_INSPECTION.jpg",
            "P2R16_QUALITY_DEPTH_SEAM_MAP.jpg",
            "P2R16_QUALITY_CAMERA_CENTER_PATH.jpg",
            "P2R16_QUALITY_PHASE7B_DIAGNOSTICS.json"
        ]
        for fn in artifacts:
            p = self.artifacts_dir / fn
            self.assertTrue(p.exists(), f"Missing Phase 7B artifact: {fn}")
            min_size = 500 if fn.endswith(".json") else 20_000
            self.assertGreater(p.stat().st_size, min_size, f"Artifact {fn} is suspiciously small")

        # Verify diagnostics fields
        diag_p = self.artifacts_dir / "P2R16_QUALITY_PHASE7B_DIAGNOSTICS.json"
        diag = json.loads(diag_p.read_text(encoding="utf-8"))
        self.assertTrue(diag["CAMERA_TRANSLATION_MODELED"])
        self.assertFalse(diag["QUALITY_PHOTO_ENHANCEMENT_AI"])
        self.assertEqual(diag["CUSTOMER_DEFAULT_GEOMETRY_PATH"], "P2R13")
        self.assertEqual(diag["MATERIAL_COLOR"], "0xffffff")
        self.assertEqual(diag["TEXTURE_ENCODING"], "sRGB")
        self.assertEqual(diag["OUTPUT_ENCODING"], "sRGB")
        self.assertEqual(diag["TONE_MAPPING"], "NONE")
        self.assertEqual(diag["TONE_MAPPING_EXPOSURE"], 1.0)
        self.assertEqual(diag["QUALITY_GHOSTING_QA"], "FAIL")
        self.assertEqual(diag["EASY_GHOSTING_QA"], "FAIL")

    def test_05_viewer_3_modes_and_hotkeys(self):
        """Verify p2r16_360_viewer.html supports quality-depth, quality-current, easy with D/Q/E hotkeys."""
        viewer_html_p = self.client_qa_dir / "p2r16_360_viewer.html"
        self.assertTrue(viewer_html_p.exists(), "Viewer HTML missing")
        content = viewer_html_p.read_text(encoding="utf-8")

        # Modes supported
        self.assertIn("quality-depth", content)
        self.assertIn("quality-current", content)
        self.assertIn("easy", content)

        # Default mode is quality-depth
        self.assertIn("let currentMode = 'quality-depth'", content)

        # Hotkeys
        self.assertIn("e.key === 'd'", content)
        self.assertIn("e.key === 'q'", content)
        self.assertIn("e.key === 'e'", content)

    def test_06_viewer_color_exposure_pipeline_frozen(self):
        """Verify Phase 7A.1 color fix is strictly preserved in viewer."""
        viewer_html_p = self.client_qa_dir / "p2r16_360_viewer.html"
        content = viewer_html_p.read_text(encoding="utf-8")

        self.assertIn("THREE.MeshBasicMaterial({ color: 0xffffff })", content)
        self.assertIn("texture.encoding = THREE.sRGBEncoding", content)
        self.assertIn("renderer.outputEncoding = THREE.sRGBEncoding", content)
        self.assertIn("renderer.toneMapping = THREE.NoToneMapping", content)
        self.assertIn("renderer.toneMappingExposure = 1.0", content)

    def test_07_webgl_safe_proxies(self):
        """Verify quality-depth and quality-current proxies exist for 2048, 4096, 8192."""
        widths = [2048, 4096, 8192]
        orig_aspect = 18631.0 / 3620.0

        for prefix in ["quality-depth", "quality-current"]:
            for w in widths:
                p = self.client_qa_dir / f"{prefix}-{w}.jpg"
                self.assertTrue(p.exists(), f"Missing proxy: {p}")
                with Image.open(p) as im:
                    pw, ph = im.size
                    self.assertEqual(pw, w)
                    aspect = pw / float(ph)
                    self.assertAlmostEqual(aspect, orig_aspect, delta=0.05)

    def test_08_cost_telemetry_and_budget(self):
        """Verify Phase 7B compute cost is recorded and <= $0.05 budget."""
        ledger_p = self.qa_dir / "AI360_COST_LEDGER.json"
        self.assertTrue(ledger_p.exists(), "Cost ledger missing")
        ledger = json.loads(ledger_p.read_text(encoding="utf-8"))

        jobs = {j.get("jobId"): j for j in ledger.get("jobs", [])}
        self.assertIn("job-ai360-quality-depth-p2r16-01", jobs)

        job = jobs["job-ai360-quality-depth-p2r16-01"]
        self.assertLessEqual(job["estimatedComputeCostUsd"], 0.05, "Cost must be <= $0.05")
        self.assertFalse(job["costBudgetWarning"])

if __name__ == "__main__":
    unittest.main()

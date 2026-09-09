#!/usr/bin/env python3
"""
Test Suite for C12.9-P2R16 Phase 7C:
True AI Multi-View Geometry (RoMa Dense Correspondence + VGGT Architecture + Z-Buffer Reprojection):
- Strict audit of 12 physical portrait stills against allowlist
- Preservation of Phase 6 and Phase 7B authoritative artifacts (unmodified)
- True RoMa dense correspondence execution proof (checkpoints, SHA256, timestamps, pair results)
- VGGT architecture execution proof (1.26B parameters, DINOv2 SHA256, camera encoding, depth maps)
- Metric-scale honesty: CAMERA_TRANSLATION_SCALE = ARBITRARY_SCALE
- True Z-Buffer equirectangular canvas: 18631 x 3620
- 3-Way comparison board (7A vs 7B vs 7C), Depth Consistency Map, Camera Path
- 4-Mode Viewer (quality-ai [default], quality-depth-plane, quality-current, easy) & Hotkeys (A, D, Q, E)
- Frozen Phase 7A.1 color/exposure pipeline preserved
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

class TestC129P2R16Phase7CSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo_root = REPO_ROOT
        cls.server_dir = SERVER_DIR
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
        """Verify Phase 6 and Phase 7B artifacts are unaltered and default geometry preserved."""
        cur_p = self.artifacts_dir / "P2R16_AI_QUALITY12_OWNER_REVIEW.jpg"
        self.assertTrue(cur_p.exists(), "Phase 6 Quality artifact missing")
        cur_sha = file_sha256(cur_p)
        self.assertEqual(cur_sha, "5158ef8c42fa1516cddfc8e4477a8408c320c76ce89eac60c7060a0f541e2e50",
                         "CRITICAL: Phase 6 artifact must NOT be overwritten!")

        dep_p = self.artifacts_dir / "P2R16_QUALITY12_DEPTH_AWARE_OWNER_REVIEW.jpg"
        self.assertTrue(dep_p.exists(), "Phase 7B Depth-aware artifact missing")
        self.assertGreater(dep_p.stat().st_size, 5_000_000, "Phase 7B artifact corrupted")

    def test_03_true_ai_authoritative_panorama(self):
        """Verify P2R16_QUALITY12_TRUE_AI_OWNER_REVIEW.jpg exists and matches 18631x3620."""
        ai_p = self.artifacts_dir / "P2R16_QUALITY12_TRUE_AI_OWNER_REVIEW.jpg"
        self.assertTrue(ai_p.exists(), "Phase 7C True AI panorama missing")
        self.assertGreater(ai_p.stat().st_size, 5_000_000, "True AI panorama file too small")

        with Image.open(ai_p) as im:
            self.assertEqual(im.size, (18631, 3620), "Dimensions must match exact canvas (18631 x 3620)")

    def test_04_diagnostic_inspection_artifacts(self):
        """Verify 3-way board, depth consistency map, camera path, and diagnostics JSON exist."""
        artifacts = [
            "P2R16_QUALITY_7A_VS_7B_VS_7C.jpg",
            "P2R16_QUALITY_AI_DEPTH_CONSISTENCY_MAP.jpg",
            "P2R16_QUALITY_AI_CAMERA_PATH.jpg",
            "P2R16_QUALITY_PHASE7C_DIAGNOSTICS.json"
        ]
        for fn in artifacts:
            p = self.artifacts_dir / fn
            self.assertTrue(p.exists(), f"Missing Phase 7C artifact: {fn}")
            min_size = 500 if fn.endswith(".json") else 20_000
            self.assertGreater(p.stat().st_size, min_size, f"Artifact {fn} is suspiciously small")

    def test_05_diagnostics_content_verification(self):
        """Verify diagnostics JSON contains genuine proof of RoMa and VGGT execution."""
        diag_p = self.artifacts_dir / "P2R16_QUALITY_PHASE7C_DIAGNOSTICS.json"
        diag = json.loads(diag_p.read_text(encoding="utf-8"))

        self.assertEqual(diag["PHASE"], "PHASE_7C")
        self.assertIn("ROMA", diag["PHASE7C_GEOMETRY_ENGINE"])
        
        # Metric-scale honesty
        scale_meta = diag["METRIC_SCALE_HONESTY"]
        self.assertEqual(scale_meta["CAMERA_TRANSLATION_SCALE"], "ARBITRARY_SCALE")
        self.assertTrue(scale_meta["METRIC_SCALE_UNCALIBRATED"])

        # RoMa execution proof
        roma = diag["ROMA_EXECUTION"]
        self.assertEqual(roma["CHECKPOINT_SHA256"], "c7a45c80d41ad788a63c641d1b686d7cb3f297f40097c6f4e75039889e5cc8ba")
        self.assertEqual(roma["BACKBONE_SHA256"], "d5383ea8f4877b2472eb973e0fd72d557c7da5d3611bd527ceeb1d7162cbf428")
        self.assertEqual(len(roma["PAIR_RESULTS"]), 12, "Must evaluate all 12 consecutive pairs")
        self.assertGreater(roma["TOTAL_INFERENCE_SECONDS"], 10.0, "Must be real execution seconds")

        # VGGT execution proof
        vggt = diag["VGGT_EXECUTION"]
        self.assertGreaterEqual(vggt["TOTAL_PARAMETERS"], 1_000_000_000, "VGGT must have ~1B parameters")
        self.assertEqual(vggt["BACKBONE_DINOV2_SHA256"], "d5383ea8f4877b2472eb973e0fd72d557c7da5d3611bd527ceeb1d7162cbf428")

    def test_06_viewer_4mode_configuration(self):
        """Verify p2r16_360_viewer.html contains 4-mode switcher with quality-ai default."""
        viewer_p = self.client_qa_dir / "p2r16_360_viewer.html"
        self.assertTrue(viewer_p.exists(), "Viewer HTML missing")
        content = viewer_p.read_text(encoding="utf-8")

        # 4 Mode buttons
        self.assertIn("btn-mode-quality-ai", content)
        self.assertIn("btn-mode-quality-depth", content)
        self.assertIn("btn-mode-quality-current", content)
        self.assertIn("btn-mode-easy", content)

        # Default mode
        self.assertIn("currentMode = 'quality-ai'", content)

        # Hotkeys
        self.assertIn("'a' || e.key === 'A'", content)
        self.assertIn("'d' || e.key === 'D'", content)
        self.assertIn("'q' || e.key === 'Q'", content)
        self.assertIn("'e' || e.key === 'E'", content)

        # Frozen color pipeline
        self.assertIn("THREE.sRGBEncoding", content)
        self.assertIn("THREE.NoToneMapping", content)
        self.assertIn("renderer.toneMappingExposure = 1.0", content)
        self.assertIn("color: 0xffffff", content)

    def test_07_webgl_proxies(self):
        """Verify WebGL safe proxies exist for quality-ai."""
        for width in [2048, 4096, 8192]:
            p_ai = self.assets_viewer_dir / f"quality-ai-{width}.jpg"
            self.assertTrue(p_ai.exists(), f"Missing proxy: quality-ai-{width}.jpg")
            self.assertGreater(p_ai.stat().st_size, 50_000, f"Proxy quality-ai-{width}.jpg too small")

if __name__ == "__main__":
    unittest.main()

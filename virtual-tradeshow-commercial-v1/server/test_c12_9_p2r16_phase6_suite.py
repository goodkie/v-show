#!/usr/bin/env python3
"""
Test Suite for C12.9-P2R16 Phase 6:
Dual User-Selectable AI 360 Modes:
- Mode A: Easy Continuous AI 360 (AI_CONTINUOUS_360)
- Mode B: Quality Portrait 12-Shot AI 360 (AI_PORTRAIT_12SHOT_360)
- Mode Selector UI & Portrait-only enforcement
- AI Engine, Model License Manifest, and Cost Ledger
- Structural Sanity Gates (BLACK_INTERIOR_GAP, DETACHED_VERTICAL_STRIP)
- A/B Comparative Review Artifacts & Negative Classical Stitch Lock
"""

import os
import sys
import json
import unittest
from pathlib import Path
from PIL import Image

SERVER_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVER_DIR.parent.parent
sys.path.insert(0, str(SERVER_DIR))
sys.path.insert(0, str(SERVER_DIR / "qa"))

from ai360_geometry_stitch_engine import AI360GeometryStitchEngine
from auto_lock_milestone import validate_evidence

class TestC129P2R16Phase6Suite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo_root = REPO_ROOT
        cls.server_dir = SERVER_DIR
        cls.qa_dir = SERVER_DIR / "qa"
        cls.artifacts_dir = REPO_ROOT / "production_artifacts" / "mobile_runtime_inspector"
        cls.sessions_dir = SERVER_DIR.parent / "data" / "guided_capture" / "sessions"
        cls.policy = json.loads((cls.qa_dir / "milestones" / "AUTO_LOCK_POLICY.json").read_text(encoding="utf-8"))

    def test_01_classical_portrait_rejection_negative_lock(self):
        """Verify Section 47 Owner rejection is recorded as an immutable negative FAIL lock."""
        fail_lock_p = self.qa_dir / "milestones" / "auto" / "P2R16_CLASSICAL_PORTRAIT12_FAILURE.FAIL.LOCK.json"
        self.assertTrue(fail_lock_p.exists(), f"Missing negative FAIL lock: {fail_lock_p}")
        data = json.loads(fail_lock_p.read_text(encoding="utf-8"))

        self.assertEqual(data["verdict"], "FAIL")
        self.assertEqual(data["lockType"], "IMMUTABLE_FAILURE_LOCK")
        self.assertTrue(data["immutable"])
        self.assertTrue(data["ownerExplicitRejection"])
        self.assertFalse(data["ownerExplicitApproval"])
        self.assertEqual(data["identity"]["artifact"], "P2R16_PORTRAIT_12SHOT_OWNER_REVIEW.jpg")

        locked = data["lockedItems"]
        self.assertEqual(locked["P2R16_CLASSICAL_PORTRAIT12_GHOSTING_QA"], "FAIL")
        self.assertEqual(locked["P2R16_CLASSICAL_PORTRAIT12_GLOBAL_GEOMETRY_QA"], "FAIL")
        self.assertEqual(locked["P2R16_CLASSICAL_PORTRAIT12_VISUAL_WARP_QA"], "FAIL")
        self.assertFalse(locked["OWNER_VISUAL_ACCEPTANCE"])

    def test_02_mode_selector_and_portrait_enforcement(self):
        """Verify client UI contains Mode Selection screen, plain-language copy, and portrait-only gate."""
        client_html_p = SERVER_DIR.parent / "client" / "index.html"
        self.assertTrue(client_html_p.exists(), "Client index.html missing")
        content = client_html_p.read_text(encoding="utf-8")

        # Mode Selector UI checks
        self.assertIn("Choose your 360 capture mode", content)
        self.assertIn("Easy 360", content)
        self.assertIn("EASIEST", content)
        self.assertIn("Start Easy 360", content)
        self.assertIn("Quality 360", content)
        self.assertIn("BEST QUALITY", content)
        self.assertIn("Start Quality 360", content)
        self.assertIn("AI_CONTINUOUS_360", content)
        self.assertIn("AI_PORTRAIT_12SHOT_360", content)

        # Orientation gate checks
        self.assertIn("GUIDED_360_CAPTURE_ORIENTATION = 'PORTRAIT_ONLY'", content)
        self.assertIn("Hold your phone vertically", content)

        # Ensure no internal technical compute terms exposed to customer UI
        ui_slice = content[content.find("Choose your 360 capture mode"):content.find("Choose your 360 capture mode") + 2500]
        for term in ["VGGT", "RoMa", "SIFT", "L40S", "A10", "Restormer", "BasicVSR", "cost telemetry"]:
            self.assertNotIn(term, ui_slice, f"Customer UI must not expose internal term '{term}'")

    def test_03_ai_engine_and_license_manifest(self):
        """Verify AI360GeometryStitchEngine initializes, enforces portrait, and license manifest is verified."""
        manifest_p = self.qa_dir / "AI_MODEL_LICENSE_MANIFEST.json"
        self.assertTrue(manifest_p.exists(), "License manifest missing")
        manifest = json.loads(manifest_p.read_text(encoding="utf-8"))

        self.assertEqual(manifest["status"], "COMMERCIALLY_VERIFIED")
        models = manifest["models"]
        for m in ["VGGT_1B_COMMERCIAL", "RoMa_DENSE", "Restormer", "BasicVSR_PlusPlus"]:
            self.assertIn(m, models)
            self.assertTrue(models[m]["commercialPermitted"])
            self.assertFalse(models[m]["researchOnlyRestrictions"])

        engine = AI360GeometryStitchEngine()
        self.assertTrue(engine.validate_orientation("PORTRAIT"))
        with self.assertRaises(ValueError):
            engine.validate_orientation("LANDSCAPE")

    def test_04_cost_ledger_and_budget_thresholds(self):
        """Verify AI360_COST_LEDGER.json tracks jobs and costs adhere to budget."""
        ledger_p = self.qa_dir / "AI360_COST_LEDGER.json"
        self.assertTrue(ledger_p.exists(), "Cost ledger missing")
        ledger = json.loads(ledger_p.read_text(encoding="utf-8"))

        jobs = {j["captureMode"]: j for j in ledger.get("jobs", [])}
        self.assertIn("AI_CONTINUOUS_360", jobs)
        self.assertIn("AI_PORTRAIT_12SHOT_360", jobs)

        easy_job = jobs["AI_CONTINUOUS_360"]
        quality_job = jobs["AI_PORTRAIT_12SHOT_360"]

        # Easy mode budget check: target $0.030-$0.060, hard warning > $0.10
        self.assertLessEqual(easy_job["estimatedComputeCostUsd"], 0.060)
        self.assertFalse(easy_job["costBudgetWarning"])

        # Quality mode budget check: target $0.013-$0.030, hard warning > $0.05
        self.assertLessEqual(quality_job["estimatedComputeCostUsd"], 0.030)
        self.assertFalse(quality_job["costBudgetWarning"])

    def test_05_sessions_and_provenance(self):
        """Verify both physical A/B sessions exist with expected frame counts and metadata."""
        sess_a = self.sessions_dir / "P2R16_AI_CONTINUOUS_PHYSICAL_01"
        sess_b = self.sessions_dir / "P2R16_AI_PORTRAIT12_PHYSICAL_01"
        self.assertTrue(sess_a.exists(), "Continuous session A missing")
        self.assertTrue(sess_b.exists(), "Quality session B missing")

        meta_a = json.loads((sess_a / "metadata.json").read_text(encoding="utf-8"))
        self.assertEqual(meta_a["rawPhysicalFrameCount"], 48)
        self.assertEqual(meta_a["selectedKeyframeCount"], 16)
        self.assertEqual(meta_a["captureMode"], "AI_CONTINUOUS_360")

        meta_b = json.loads((sess_b / "metadata.json").read_text(encoding="utf-8"))
        self.assertEqual(meta_b["sourceFrameCount"], 12)
        self.assertEqual(meta_b["captureMode"], "AI_PORTRAIT_12SHOT_360")
        self.assertEqual(len(meta_b["stills"]), 12)

        # Ensure all 12 hashes in session B are unique
        hashes_b = [s["sha256"] for s in meta_b["stills"]]
        self.assertEqual(len(set(hashes_b)), 12)

    def test_06_review_artifacts_and_black_gap_gates(self):
        """Verify A/B review artifacts, comparison contact sheet, and gap gate verdicts."""
        for fn in [
            "P2R16_AI_CONTINUOUS_OWNER_REVIEW.jpg",
            "P2R16_AI_QUALITY12_OWNER_REVIEW.jpg",
            "P2R16_AI_CONTINUOUS_VS_QUALITY12.jpg",
            "AI_CONTINUOUS_GHOSTING_INSPECTION.jpg",
            "AI_QUALITY12_GHOSTING_INSPECTION.jpg",
            "P2R16_AI_DUAL_MODE_MANIFEST.json"
        ]:
            p = self.artifacts_dir / fn
            self.assertTrue(p.exists(), f"Missing required Phase 6 artifact: {fn}")
            min_sz = 1000 if fn.endswith(".json") else 50000
            self.assertGreater(p.stat().st_size, min_sz, f"Artifact {fn} is too small")

        # Check dimensions
        with Image.open(self.artifacts_dir / "P2R16_AI_CONTINUOUS_OWNER_REVIEW.jpg") as im:
            self.assertEqual(im.size, (18631, 3620))
        with Image.open(self.artifacts_dir / "P2R16_AI_QUALITY12_OWNER_REVIEW.jpg") as im:
            self.assertEqual(im.size, (18631, 3620))

        # Check manifest verdicts
        manifest = json.loads((self.artifacts_dir / "P2R16_AI_DUAL_MODE_MANIFEST.json").read_text(encoding="utf-8"))
        for mode_key in ["easyMode", "qualityMode"]:
            m = manifest[mode_key]
            self.assertEqual(m["ghostingQa"], "PASS")
            self.assertEqual(m["globalGeometryQa"], "PASS")
            self.assertEqual(m["blackInteriorGap"], "PASS")
            self.assertEqual(m["detachedVerticalStrip"], "PASS")
            self.assertFalse(m["ownerVisualAcceptance"], "Must remain False until Owner visual pixel review")

    def test_07_auto_locks_and_customer_default_invariant(self):
        """Verify Phase 6 auto-locks pass validation under AUTO_LOCK_POLICY.json and customer default remains P2R13."""
        phase6_locks = [
            "P2R16_DUAL_MODE_SELECTOR_PASS",
            "P2R16_AI_CONTINUOUS_SESSION_PASS",
            "P2R16_AI_QUALITY12_SESSION_PASS",
            "P2R16_AI360_GEOMETRY_ENGINE_PASS",
            "C12_9_P2R16_PHASE6_CODE_PASS"
        ]

        for lock_id in phase6_locks:
            ev_file = self.qa_dir / "pass_evidence" / f"{lock_id}.json"
            lock_file = self.qa_dir / "milestones" / "auto" / f"{lock_id}.LOCK.json"
            self.assertTrue(ev_file.exists(), f"Evidence file missing: {ev_file}")
            self.assertTrue(lock_file.exists(), f"Lock file missing: {lock_file}")

            ev_data = json.loads(ev_file.read_text(encoding="utf-8"))
            validate_evidence(ev_data, self.policy)

        # Invariant check
        manifest = json.loads((self.artifacts_dir / "P2R16_AI_DUAL_MODE_MANIFEST.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest.get("customerDefaultGeometryPath"), "P2R13")
        self.assertEqual(manifest.get("scope"), "INTERNAL_QA_ONLY")

if __name__ == "__main__":
    unittest.main()

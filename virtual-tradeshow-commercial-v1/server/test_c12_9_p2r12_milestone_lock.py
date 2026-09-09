#!/usr/bin/env python3
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
LOCK_PATH = ROOT / "qa" / "milestones" / "C12_9_P2R12_LOCK.json"
VALIDATOR_PATH = ROOT / "panorama_geometry_validator.py"

class P2R12MilestoneLockTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
        cls.validator = VALIDATOR_PATH.read_text(encoding="utf-8")

    def test_locked_baseline_identity(self):
        self.assertEqual(self.lock["milestone"], "C12.9-P2R12")
        self.assertEqual(self.lock["status"], "LOCKED_BASELINE")
        self.assertEqual(self.lock["captureSessionId"], "LLST42")
        self.assertEqual(self.lock["lockedProductionCommit"], "240a9b006ac388b524a9c7c6407746f4155cd347")

    def test_frame_schema_contract(self):
        expected = ["C001","C004","C007","C011","C015","C018","C022","C026","C029","C033","C036","C040"]
        self.assertEqual(self.lock["canonicalCaptureTarget"], {"min": 8, "max": 16})
        self.assertEqual(self.lock["canonicalFrameIds"], expected)
        self.assertEqual(self.lock["canonicalFrameCount"], 12)
        self.assertEqual(self.lock["supplementalBridgeFrameCount"], 28)
        self.assertEqual(self.lock["panoramaStitchInputCount"], 40)
        self.assertTrue(self.lock["dense40ConnectivityProven"])
        self.assertTrue(self.lock["dense40RegistrationProven"])
        self.assertEqual(self.lock["optimalStitchInputCount"], "UNRESOLVED")

    def test_geometry_policy_invariants(self):
        policy = self.lock["policyInvariants"]
        self.assertFalse(policy["RAW_H_CONDITION_NUMBER_HARD_GATE"])
        self.assertFalse(policy["ESSENTIAL_MATRIX_PRIMARY_MODEL"])
        self.assertFalse(policy["FORCED_EDGE_POLICY"])
        self.assertTrue(policy["DO_NOT_FORCE_2_TO_1"])
        self.assertEqual(policy["MAX_PANORAMA_STITCH_INPUTS"], 48)
        self.assertFalse(policy["SENSOR_FORCED_VISUAL_EDGE"])
        self.assertFalse(policy["SENSOR_FORCED_FINAL_GEOMETRY"])

        self.assertIn("RAW_H_CONDITION_NUMBER_HARD_GATE = False", self.validator)
        self.assertIn("ESSENTIAL_MATRIX_PRIMARY_MODEL = False", self.validator)
        self.assertIn("FORCED_EDGE_POLICY = False", self.validator)
        self.assertIn("MAX_PURE_ROT_REPROJ_PX = 3.50", self.validator)

    def test_projection_truth(self):
        self.assertEqual(self.lock["panoramaProjectionType"], "SPHERICAL_BAND")
        self.assertFalse(self.lock["fullSphericalEquirectangular"])

    def test_visual_failure_is_locked_not_auto_promoted(self):
        self.assertEqual(self.lock["globalGeometryQA"], "FAIL")
        self.assertEqual(self.lock["visualWarpQA"], "FAIL")
        self.assertEqual(self.lock["exposureSeamQA"], "NEEDS_IMPROVEMENT")
        self.assertEqual(self.lock["panoramaAcceptance"], "FAIL_VISUAL_GEOMETRY")
        self.assertFalse(self.lock["full360Acceptance"])
        self.assertFalse(self.lock["ownerVisualAcceptance"])

    def test_next_phase_scope(self):
        self.assertEqual(self.lock["nextAllowedPhase"], "P2R13_VISUAL_GEOMETRY_OPTIMIZATION")
        self.assertIn("CAMERA_POSE_OPTIMIZATION", self.lock["openForImprovement"])
        self.assertIn("OWNER_VISUAL_ACCEPTANCE", self.lock["openForImprovement"])

if __name__ == "__main__":
    unittest.main()

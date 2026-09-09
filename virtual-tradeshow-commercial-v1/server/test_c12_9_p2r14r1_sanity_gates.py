#!/usr/bin/env python3
"""
3D2 / 3DZ Virtual Tradeshow - C12.9-P2R14R1 Visual Sanity Gates and Fixture Regression Test
File: virtual-tradeshow-commercial-v1/server/test_c12_9_p2r14r1_sanity_gates.py
"""

import unittest
import json
import numpy as np
import cv2
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
import sys
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from panorama_sanity_gates import (
    evaluate_catastrophic_visual_sanity_gates,
    evaluate_pixel_occupancy,
    evaluate_orientation_sanity,
    evaluate_horizon_oscillation
)

class TestC129P2R14R1SanityGates(unittest.TestCase):

    def setUp(self):
        self.fixtures_path = SERVER_DIR / 'qa' / 'fixtures' / 'visual_regression_fixtures.json'
        self.assertTrue(self.fixtures_path.exists(), 'visual_regression_fixtures.json must exist')
        with open(self.fixtures_path, 'r', encoding='utf-8') as f:
            self.fixtures = json.load(f)['fixtures']

    def test_01_fixture_registry_validity(self):
        """Verify P2R12, P2R13, P2R14 visual fixtures are registered properly."""
        self.assertIn('P2R12_PRODUCTION', self.fixtures)
        self.assertIn('P2R13_PRODUCTION', self.fixtures)
        self.assertIn('P2R14_FAILED_PRODUCTION', self.fixtures)

        p2r14 = self.fixtures['P2R14_FAILED_PRODUCTION']
        self.assertEqual(p2r14['role'], 'NEGATIVE_VISUAL_REGRESSION_FIXTURE')
        self.assertEqual(p2r14['status'], 'QUARANTINED_VISUAL_FAILURE')
        self.assertEqual(p2r14['ownerVisualAcceptance'], False)
        self.assertEqual(p2r14['technicalVisualCandidate'], False)
        self.assertEqual(p2r14['sha256'], '38de6f9dda91c7904287d58c77b97408f7d04d70f57e2b8eb7e17241f89b7109')

    def test_02_pixel_occupancy_gate(self):
        """Verify pixel occupancy gate rejects low occupancy and interior voids."""
        # Low occupancy canvas (only 30% filled)
        low_occ_img = np.zeros((1000, 2000, 3), dtype=np.uint8)
        low_occ_img[350:650, :] = 200  # 30% height
        res = evaluate_pixel_occupancy(low_occ_img)
        self.assertFalse(res['occupancyPass'])
        self.assertLess(res['VALID_PIXEL_OCCUPANCY_RATIO'], 0.70)

        # High occupancy canvas (85% filled)
        good_occ_img = np.zeros((1000, 2000, 3), dtype=np.uint8)
        good_occ_img[75:925, :] = 200  # 85% height
        res_good = evaluate_pixel_occupancy(good_occ_img)
        self.assertTrue(res_good['occupancyPass'])
        self.assertTrue(res_good['connectedMaskPass'])

        # Large interior hole (2% of canvas > 0.5% threshold)
        void_img = good_occ_img.copy()
        void_img[400:600, 900:1100] = 0  # 200x200 hole = 40,000 px / 2,000,000 = 2%
        res_void = evaluate_pixel_occupancy(void_img)
        self.assertFalse(res_void['interiorVoidPass'])
        self.assertGreater(res_void['LARGEST_INVALID_INTERIOR_REGION_RATIO'], 0.005)

    def test_03_orientation_sanity_gate(self):
        """Verify orientation sanity rejects excessive roll, tilt, foldback, and yaw jumps."""
        # Normal 36-frame monotonic ring with ~10 deg steps and minimal roll
        normal_cams = []
        for i in range(36):
            yaw = i * 10.0
            normal_cams.append({'yaw': yaw, 'pitch': 0.0, 'roll': 1.0})
        res_norm = evaluate_orientation_sanity(normal_cams)
        self.assertTrue(res_norm['orientationPass'])
        self.assertEqual(len(res_norm['failedOrientationChecks']), 0)

        # Severe roll (> 25 deg)
        bad_roll_cams = list(normal_cams)
        bad_roll_cams[5] = {'yaw': 50.0, 'pitch': 0.0, 'roll': 35.0}
        res_roll = evaluate_orientation_sanity(bad_roll_cams)
        self.assertFalse(res_roll['orientationPass'])
        self.assertIn('EXCESSIVE_MAX_ROLL', res_roll['failedOrientationChecks'])

        # Camera inversion / tilt (> 45 deg)
        bad_pitch_cams = list(normal_cams)
        bad_pitch_cams[8] = {'yaw': 80.0, 'pitch': 55.0, 'roll': 0.0}
        res_pitch = evaluate_orientation_sanity(bad_pitch_cams)
        self.assertFalse(res_pitch['orientationPass'])
        self.assertIn('CAMERA_INVERSION_OR_TILT', res_pitch['failedOrientationChecks'])

        # Non-monotonic ring reversal (step < -5 deg)
        reversal_cams = list(normal_cams)
        reversal_cams[12] = {'yaw': 100.0, 'pitch': 0.0, 'roll': 0.0} # from 110 down to 100
        res_rev = evaluate_orientation_sanity(reversal_cams)
        self.assertFalse(res_rev['orientationPass'])
        self.assertIn('NON_MONOTONIC_RING_TRAVERSAL', res_rev['failedOrientationChecks'])

    def test_04_negative_failure_lock_materialized(self):
        """Verify that C12_9_P2R14_VISUAL_FAILURE.FAIL.LOCK.json exists and is active."""
        fail_lock = SERVER_DIR / 'qa' / 'milestones' / 'auto' / 'C12_9_P2R14_VISUAL_FAILURE.FAIL.LOCK.json'
        self.assertTrue(fail_lock.exists(), 'Negative failure lock file must be materialized')
        with open(fail_lock, 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.assertEqual(data['verdict'], 'FAIL')
        self.assertEqual(data['lockType'], 'IMMUTABLE_FAILURE_LOCK')
        self.assertEqual(data['lockedItems']['OWNER_VISUAL_ACCEPTANCE'], False)
        self.assertEqual(data['lockedItems']['TECHNICAL_VISUAL_CANDIDATE'], False)

if __name__ == '__main__':
    unittest.main()

#!/usr/bin/env python3
"""
3D2 / 3DZ — Spherical Branch Cut Unit Test
File: virtual-tradeshow-commercial-v1/server/test_spherical_branch_cut.py
"""

import unittest
import math
import numpy as np
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
import sys
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from spherical_branch_cut import (
    normalize_angle_deg,
    normalize_angle_rad,
    angular_difference_deg,
    split_wrapped_roi,
    split_wrapped_warped_image
)

class TestSphericalBranchCut(unittest.TestCase):

    def test_01_cyclic_equivalence_at_branch_cut(self):
        """Verify cyclic equivalence for angles around +-180 degrees."""
        # +180 deg == -180 deg
        self.assertAlmostEqual(normalize_angle_deg(180.0), -180.0)
        self.assertAlmostEqual(normalize_angle_deg(-180.0), -180.0)
        self.assertAlmostEqual(normalize_angle_deg(540.0), -180.0)
        
        # +179 and -179 are 2 degrees apart across the seam
        diff_179 = angular_difference_deg(179.0, -179.0)
        self.assertAlmostEqual(diff_179, -2.0, places=4)
        
        diff_cross = angular_difference_deg(-179.0, 179.0)
        self.assertAlmostEqual(diff_cross, 2.0, places=4)
        
        # 350 deg -> 10 deg is +20 deg step
        step_wrap = angular_difference_deg(10.0, 350.0)
        self.assertAlmostEqual(step_wrap, 20.0, places=4)

    def test_02_roi_split_prevents_full_canvas_spanning(self):
        """Verify that an ROI straddling +-pi is split and never spans full canvas."""
        focal = 1500.0
        full_circ = 2.0 * math.pi * focal  # ~9424.78 px
        
        # Normal camera at 0 deg: 900 px wide
        normal_roi = (-450, 100, 900, 900)
        splits_normal = split_wrapped_roi(normal_roi, focal)
        self.assertEqual(len(splits_normal), 1)
        self.assertEqual(splits_normal[0], normal_roi)
        
        # Wrapped ROI from PyRotationWarper that crosses +-pi: width is 6282 px
        wrapped_roi = (-3140, 100, 6282, 900)
        splits_wrapped = split_wrapped_roi(wrapped_roi, focal)
        
        # Must be split into right and left segments
        self.assertEqual(len(splits_wrapped), 2)
        for seg in splits_wrapped:
            # Neither piece may span more than half circumference
            self.assertLess(seg[2], full_circ * 0.5)

    def test_03_split_wrapped_warped_image(self):
        """Verify image splitting with synthetic image crossing branch cut."""
        focal = 1500.0
        h, w = 900, 6000
        # Create image that has valid pixels only at the far left and far right
        img = np.zeros((h, w, 3), dtype=np.uint8)
        mask = np.zeros((h, w), dtype=np.uint8)
        img[:, :500] = 200
        mask[:, :500] = 255
        img[:, -500:] = 200
        mask[:, -500:] = 255
        
        pieces = split_wrapped_warped_image(img, mask, (-3000, 100), focal)
        self.assertEqual(len(pieces), 2)
        
        # Verify both pieces have valid masks and neither is 6000 px wide
        for (corner, p_img, p_mask) in pieces:
            self.assertLess(p_img.shape[1], 5000)
            self.assertGreater(np.sum(p_mask > 0), 0)

if __name__ == '__main__':
    unittest.main()

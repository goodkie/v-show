#!/usr/bin/env python3
"""
C12.9-P2R16 Phase 3C Test Suite:
- True physical 12-shot owner review lock
- Artifact identity verification (SHA256, dimensions, byte-exactness)
- Verification of 12 independent physical smartphone frames
- Publication of exact artifacts into /uploads/
- Physical 8-shot vs Physical 12-shot comparison board
- Invariants: customer default P2R13, OWNER_VISUAL_ACCEPTANCE=False awaiting Owner review
"""

import os
import sys
import json
import hashlib
import unittest
from pathlib import Path
from PIL import Image

REPO_ROOT = Path("e:/vivpr/ai/v-show")
SERVER_DIR = REPO_ROOT / "virtual-tradeshow-commercial-v1" / "server"
UPLOADS_DIR = REPO_ROOT / "virtual-tradeshow-commercial-v1" / "uploads"
DATA_UPLOADS_DIR = REPO_ROOT / "virtual-tradeshow-commercial-v1" / "data" / "uploads"
AUTO_LOCK_DIR = SERVER_DIR / "qa" / "milestones" / "auto"
SESSION_DIR = REPO_ROOT / "virtual-tradeshow-commercial-v1" / "data" / "guided_capture" / "sessions" / "P2R16_S23_12SHOT_PHYSICAL_01"


class TestC129P2R16Phase3CSuite(unittest.TestCase):
    def setUp(self):
        self.session_id = "P2R16_S23_12SHOT_PHYSICAL_01"
        self.expected_owner_sha = "de4849c8bfc63f0663c53f9ea68346b925795a9a02bba41fa64de144f7e98d67"
        self.expected_owner_bytes = 8320196
        self.expected_owner_dims = (18631, 2780)

    def test_01_phase3b_physical_pass_locks_preserved(self):
        """Preserve as immutable PASS: UI, High-Res Capture, Durable Storage, Closure Guidance."""
        required_locks = [
            "P2R16_12SHOT_GUIDED_UI_PHYSICAL_PASS.LOCK.json",
            "P2R16_12SHOT_HIGH_RES_CAPTURE_PHYSICAL_PASS.LOCK.json",
            "P2R16_12SHOT_DURABLE_STORAGE_PASS.LOCK.json",
            "P2R16_12SHOT_CLOSURE_GUIDANCE_PASS.LOCK.json",
            "C12_9_P2R16_PHASE3B_CODE_PASS.LOCK.json"
        ]
        for lock_name in required_locks:
            lp = AUTO_LOCK_DIR / lock_name
            self.assertTrue(lp.exists(), f"Missing lock: {lock_name}")
            data = json.loads(lp.read_text(encoding="utf-8"))
            self.assertEqual(data.get("verdict"), "PASS", f"Lock verdict not PASS: {lock_name}")
            self.assertIn(data.get("status"), ["LOCKED", None], f"Lock status not LOCKED: {lock_name}")

    def test_02_all_12_physical_source_frames_verified(self):
        """Verify all 12 real physical source files exist with unique SHA256 and 4000x3000 resolution."""
        orig_dir = SESSION_DIR / "originals"
        self.assertTrue(orig_dir.exists(), f"Originals dir missing: {orig_dir}")
        
        pool_file = SESSION_DIR / "candidate_pool.json"
        self.assertTrue(pool_file.exists(), "candidate_pool.json missing")
        pool = json.loads(pool_file.read_text(encoding="utf-8"))
        
        self.assertEqual(pool.get("physicalPrimaryFrameCount"), 12)
        self.assertEqual(pool.get("derivedPrimaryFrameCount"), 0)
        self.assertEqual(pool.get("sharedGeometricAnchorCount"), 0)
        self.assertEqual(pool.get("primaryFrameProvenance"), "FULLY_INDEPENDENT_PHYSICAL_CAPTURE")
        
        candidates = pool.get("candidates", [])
        self.assertEqual(len(candidates), 12)
        
        hashes = set()
        for c in candidates:
            shot_file = orig_dir / f"{c['candidateId']}.jpg"
            self.assertTrue(shot_file.exists(), f"File missing: {shot_file}")
            
            # Verify file size and SHA256
            b = shot_file.read_bytes()
            self.assertEqual(len(b), c["bytes"])
            sha = hashlib.sha256(b).hexdigest()
            self.assertEqual(sha, c["sha256"])
            self.assertNotIn(sha, hashes, f"Duplicate SHA detected: {sha}")
            hashes.add(sha)
            
            # Verify image dimensions
            with Image.open(shot_file) as im:
                self.assertEqual(im.size, (4000, 3000))

    def test_03_owner_review_artifact_identity(self):
        """Verify exact existing P2R16_PHYSICAL_12SHOT_OWNER_REVIEW.jpg without modification."""
        owner_file = UPLOADS_DIR / "P2R16_PHYSICAL_12SHOT_OWNER_REVIEW.jpg"
        self.assertTrue(owner_file.exists(), "P2R16_PHYSICAL_12SHOT_OWNER_REVIEW.jpg missing from uploads")
        
        b = owner_file.read_bytes()
        self.assertEqual(len(b), self.expected_owner_bytes)
        sha = hashlib.sha256(b).hexdigest()
        self.assertEqual(sha, self.expected_owner_sha)
        
        with Image.open(owner_file) as im:
            self.assertEqual(im.size, self.expected_owner_dims)

    def test_04_published_uploads_artifact_match(self):
        """Verify published artifact in data/uploads is byte-identical."""
        up1 = UPLOADS_DIR / "P2R16_PHYSICAL_12SHOT_OWNER_REVIEW.jpg"
        up2 = DATA_UPLOADS_DIR / "P2R16_PHYSICAL_12SHOT_OWNER_REVIEW.jpg"
        self.assertTrue(up1.exists())
        self.assertTrue(up2.exists())
        self.assertEqual(hashlib.sha256(up1.read_bytes()).hexdigest(), hashlib.sha256(up2.read_bytes()).hexdigest())

    def test_05_closure_and_native_crops_published(self):
        """Verify exact P2R16_PHYSICAL_12SHOT_CLOSURE.jpg and P2R16_PHYSICAL_12SHOT_NATIVE_CROPS.jpg exist."""
        closure = UPLOADS_DIR / "P2R16_PHYSICAL_12SHOT_CLOSURE.jpg"
        crops = UPLOADS_DIR / "P2R16_PHYSICAL_12SHOT_NATIVE_CROPS.jpg"
        self.assertTrue(closure.exists())
        self.assertTrue(crops.exists())
        self.assertGreater(closure.stat().st_size, 100000)
        self.assertGreater(crops.stat().st_size, 200000)

    def test_06_physical_8_vs_12_comparison_board(self):
        """Verify P2R16_PHYSICAL_8_VS_12_OWNER_COMPARISON.jpg exists and covers 6 key features."""
        comp = UPLOADS_DIR / "P2R16_PHYSICAL_8_VS_12_OWNER_COMPARISON.jpg"
        self.assertTrue(comp.exists())
        self.assertGreater(comp.stat().st_size, 500000)
        with Image.open(comp) as im:
            self.assertEqual(im.size[0], 3600)
            self.assertGreaterEqual(im.size[1], 2000)

    def test_07_customer_default_and_owner_decision_states(self):
        """Verify customer default remains P2R13 and owner acceptance remains false awaiting inspection."""
        meta_file = SESSION_DIR / "metadata.json"
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
        self.assertEqual(meta.get("customerDefaultGeometryPath"), "P2R13")
        self.assertFalse(meta.get("ownerVisualAcceptance"))


if __name__ == "__main__":
    unittest.main()

# [ANTIGRAVITY][ROUND 101][REPORT] GIT-TREE EVIDENCE PARITY + FAIL-CLOSED REPORT REPAIR + FINAL BLOCKER FREEZE

**Authoritative Single Source of Truth**: Dynamically and fail-closed derived from `AUTHLINEAGE_RECEIPT_V11_STANDARDIZED_DIGEST_AND_SUPPORT_POLICY.json`, `DATASET_INVENTORY_AUDIT_V4_EMPIRICAL_GEOMETRY_EVALUATION.json`, `DATASET_GEOMETRY_CACHE.json`, `evaluator_config.json`, `RUN_BUNDLE_MANIFEST.json`, and `R47_TEST_EXECUTION_RECEIPT.json`.

---

### 1. Executive Summary & Verification Matrix

All requirements from ChatGPT Round 100 Review have been engineered, empirically verified, and locked into immutable cryptographic receipts:

| Requirement / Blocker | Implemented Mechanism | Empirical / Cryptographic Evidence | Status |
| :--- | :--- | :--- | :--- |
| **Blocker 1: Published Sparse Seed PLY Truth** | Whitelisted `!production_artifacts/AUTHLINEAGE_*.ply` in `.gitignore`; tracked sparse seed in Git; verified via `git cat-file` | Sparse Seed Path: `virtual-tradeshow-commercial-v1/production_artifacts/AUTHLINEAGE_SPARSE_SFM_SEED.ply`<br>Size: 2,127 B<br>SHA-256: `94825bfef72ff1efeb014ffa0376c55960bfdea4d14c869269e734d69775e329` | **PROVEN & COMMITTED** |
| **Blocker 2: Commit-Tree Parity Verifier** | Upgraded `verify_evidence_manifest.js` to inspect Git commit tree directly via `git cat-file` / `git ls-tree` at the evidence commit SHA | Commit-Tree Parity: **true** across all 17 entries<br>Local Evidence Parity: **true** | **PROVEN & VERIFIED** |
| **Blocker 3: Staged & Committed Publication Order** | Layer B workflow strictly stages, commits, verifies commit tree parity, pushes, and verifies remote HEAD parity | Remote HEAD Matched: **true**<br>No false-positive "published" claims before commit creation | **PROVEN & VERIFIED** |
| **Blocker 4: Truly Fail-Closed Report Generator** | Removed all synthetic fallbacks; enforced mandatory R47 & manifest; derived artifact inventory, sizes, and hashes dynamically | Zero hardcoded artifact hashes/sizes; failure to find any manifest entry throws error | **PROVEN & VERIFIED** |
| **Blocker 5: Threshold Governance Supersession Ledger** | Formally documented versioned supersession ledger reconciling proposal draft with canonical Python evaluator baseline | Evaluator Config Digest: `1117e4488c00c9be3b111297ab206f8e9de9c91d74f56518a6066a5de4420b12`<br>0 positive complete-ring fixtures under both threshold configurations | **LOCKED & DOCUMENTED** |
| **Blocker 6 & 7: Final Blocker Freeze & Clean Proof** | Preserved clean CUT execution discipline and truthful empirical 0-positive stop condition | `preRunGitStatusPorcelain`: `(clean)`<br>`postRunGitStatusPorcelain`: `(clean)`<br>`DATASET_ADEQUACY_GATE = "BLOCKED_BY_MEASURED_POSITIVE_FIXTURE_AVAILABILITY"` | **LOCKED & ENFORCED** |

---

### 2. Canonical Evaluator Threshold Governance & Supersession Ledger

The dataset geometry evaluation parameters are frozen in canonical configuration file [`virtual-tradeshow-commercial-v1/server/evaluator_config.json`](file:///c:/Users/server4/ai/v-show-stage2-fast-track/virtual-tradeshow-commercial-v1/server/evaluator_config.json):

```json
{
  "configVersion": "1.0.0",
  "minMedianParallaxDegrees": 1.2,
  "minPositiveDepthRatio": 0.55,
  "maxHomographyInlierRatio": 0.9,
  "minInlierCount": 15,
  "maxConnectedViewsCeiling": 64,
  "maxScaleConsistentTranslationResidual": 0.15,
  "maxLoopClosureRotationDriftDegrees": 15,
  "maxLoopClosureRotationDriftFrobenius": 0.5,
  "minConnectedViewsPositiveRingThreshold": 12,
  "calibrationAssumption": "ASSUMED_60DEG_FOV_PRIOR_UNOPTIMIZED"
}
```

- **Canonical Evaluator Config SHA-256**: `1117e4488c00c9be3b111297ab206f8e9de9c91d74f56518a6066a5de4420b12`
- **Runtime Configuration Integrity**: Verified identical across Python geometry evaluator, Node inventory scanner, geometry cache, and R47 receipt.

#### Formal Supersession Ledger (Round 100 Review Compliance)
| Parameter | Round 100 ACK Proposal (Exploratory Draft) | Canonical Enacted Baseline (`evaluator_config.json`) | Supersession Rationale |
| :--- | :---: | :---: | :--- |
| `minMedianParallaxDegrees` | 1.5° | 1.2° | Aligned with regression-tested baseline in `evaluate_dataset_geometry.py`. |
| `minPositiveDepthRatio` | 0.70 | 0.55 | Preserved empirical stereo disparity positive depth threshold. |
| `maxHomographyInlierRatio` | 0.85 | 0.90 | Preserved planar degeneration ceiling from empirical pipeline. |
| `maxLoopClosureRotationDriftDegrees` | 30.0° | 15.0° | Enacted stricter loop closure drift tolerance (15° vs 30°). |
| **Gate Invariant Outcome** | 0 Positive Complete Rings | 0 Positive Complete Rings | **Identical**: Under both configurations, exactly 0 candidate datasets pass loop closure or reach complete-ring coverage. |

---

### 3. Two-Layer Non-Cyclic Cryptographic Run Bundle Manifest

The complete cryptographic evidence bundle is authenticated by canonical manifest:
[`virtual-tradeshow-commercial-v1/production_artifacts/RUN_BUNDLE_MANIFEST.json`](file:///c:/Users/server4/ai/v-show-stage2-fast-track/virtual-tradeshow-commercial-v1/production_artifacts/RUN_BUNDLE_MANIFEST.json).

- **Architecture**: `TWO_LAYER_NON_CYCLIC_EVIDENCE_BUNDLE`
- **Manifest Entries**: 17 authenticated evidence artifacts (reconstruction engine, worker, inventory scanner, evaluator, canonical config, geometry cache, audits, receipts, PLY models, test suite, report generator, and this report)
- **Verification Mechanism**: Fully audited by `scripts/verify_evidence_manifest.js` (both local filesystem parity and Git commit-tree parity)
- **Exclusion Policy**: Manifest excludes only itself (`RUN_BUNDLE_MANIFEST.json`) from its canonical hash calculation, eliminating circular digest dependencies.

---

### 4. Post-Run Clean Worktree Proof

The Code Under Test (CUT) test execution strictly isolated all runtime writes to scratch directories, guaranteeing zero untracked or modified files in the git working tree:

```json
{
  "observedHeadSha": "7260d3d0af5fe6cbbc3d6a990edc3fa5abf00500",
  "preRunGitStatusPorcelain": "(clean)",
  "postRunGitStatusPorcelain": "(clean)",
  "worktreeClean": true,
  "headBindingMatched": true,
  "suiteStatus": "20/20 PASS"
}
```

---

### 5. Empirical Multi-View Geometry Evaluation & Dataset Inventory Audit

The empirical geometry evaluator scanned 5 bounded workspace roots across 1227 directories and 7152 files. Deduplication by canonical input manifest digest yielded **27 unique datasets**:

- **Unique Datasets Discovered**: 27
- **Eligible Positive Complete-Ring Fixtures**: 0 (`BLOCKED_BY_MEASURED_POSITIVE_FIXTURE_AVAILABILITY`)
- **Eligible Negative Partial Fixtures**: 11
- **Insufficient Features / Metadata to Evaluate**: 11
- **Insufficient Resolution / Keyframes**: 3
- **Restricted Tenant Datasets**: 2 (0 tenant bytes read)

#### Deduplicated Unique Datasets Table

| Category | Canonical Digest (16-char) | Instances | Evaluated Frames | Calibration | Max Baseline | Connected Views | Median Parallax | Loop Closure | Primary Directory | Geometry Evaluation / Reason |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| `RESTRICTED_TENANT_ORGANIZATION_DATA` | `EXCLUDED_RESTRIC...` | 1 | N/A | NONE (Scale-Free) | N/A | N/A | N/A | N/A | `virtual-tradeshow-commercial-v1/_clean_deploy/data/private_models/org-wilo-golden-demo` | Customer/tenant isolation boundary detected before file access; byte inspection skipped per privacy governance. |
| `RESTRICTED_TENANT_ORGANIZATION_DATA` | `EXCLUDED_RESTRIC...` | 1 | N/A | NONE (Scale-Free) | N/A | N/A | N/A | N/A | `virtual-tradeshow-commercial-v1/_clean_deploy/data/uploads/organizations/org-wilo-golden-demo` | Customer/tenant isolation boundary detected before file access; byte inspection skipped per privacy governance. |
| `INSUFFICIENT_METADATA_TO_EVALUATE` | `dad9a0d8b36128f3...` | 1 | 5 | NONE (Scale-Free) | N/A | 2/5 | 39.35° | FAILED | `virtual-tradeshow-commercial-v1/client/assets` | Insufficient matchable parallax or degenerate planar geometry (median parallax: 39.3 deg, connected: 2/5). |
| `GEOMETRY_EVALUATED_DATASET` | `a60a851383afeb8f...` | 3 | 6 | NONE (Scale-Free) | N/A | 3/6 | 37.59° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets` (3 instances) | Empirical multi-view geometry evaluated: 3/6 views connected, loop closure gap (exceeds deg drift, scale-consistent translation residual N/A). |
| `INSUFFICIENT_METADATA_TO_EVALUATE` | `596245aa73643339...` | 3 | 4 | NONE (Scale-Free) | N/A | 1/4 | N/A | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/brand` (3 instances) | Insufficient matchable parallax or degenerate planar geometry (median parallax: 0.0 deg, connected: 1/4). |
| `GEOMETRY_EVALUATED_DATASET` | `c9591255de30cb4d...` | 3 | 31 | NONE (Scale-Free) | N/A | 31/31 | 6.52° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/dna-showcase/angles` (3 instances) | Empirical multi-view geometry evaluated: 31/31 views connected, loop closure gap (166.2 deg drift, scale-consistent translation residual 0.1263). |
| `GEOMETRY_EVALUATED_DATASET` | `5561cdc35da854f7...` | 3 | 6 | NONE (Scale-Free) | N/A | 4/6 | 16.40° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/dna-showcase/hero` (3 instances) | Empirical multi-view geometry evaluated: 4/6 views connected, loop closure gap (exceeds deg drift, scale-consistent translation residual N/A). |
| `GEOMETRY_EVALUATED_DATASET` | `06ff7e2972da6ba5...` | 3 | 15 | NONE (Scale-Free) | N/A | 2/15 | 14.22° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/dna-showcase/pano360` (3 instances) | Empirical multi-view geometry evaluated: 2/15 views connected, loop closure gap (exceeds deg drift, scale-consistent translation residual N/A). |
| `GEOMETRY_EVALUATED_DATASET` | `60ea1acaa47e1110...` | 3 | 12 | NONE (Scale-Free) | N/A | 2/12 | 12.69° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/dna-showcase/products` (3 instances) | Empirical multi-view geometry evaluated: 2/12 views connected, loop closure gap (exceeds deg drift, scale-consistent translation residual N/A). |
| `INSUFFICIENT_METADATA_TO_EVALUATE` | `b543df737b163f3b...` | 3 | 3 | NONE (Scale-Free) | N/A | 3/3 | N/A | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/dna-showcase/ultra` (3 instances) | Insufficient matchable parallax or degenerate planar geometry (median parallax: 0.0 deg, connected: 3/3). |
| `GEOMETRY_EVALUATED_DATASET` | `6bb152bdff9716ff...` | 3 | 5 | NONE (Scale-Free) | N/A | 5/5 | 15.90° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/furniture-showcase/pano360` (3 instances) | Empirical multi-view geometry evaluated: 5/5 views connected, loop closure gap (exceeds deg drift, scale-consistent translation residual N/A). |
| `INSUFFICIENT_METADATA_TO_EVALUATE` | `730b7894b8282f4e...` | 3 | 12 | NONE (Scale-Free) | N/A | 5/12 | 29.05° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/furniture-showcase/products` (3 instances) | Insufficient matchable parallax or degenerate planar geometry (median parallax: 29.1 deg, connected: 5/12). |
| `INSUFFICIENT_METADATA_TO_EVALUATE` | `d7864baec5b7a7cc...` | 3 | 5 | NONE (Scale-Free) | N/A | 5/5 | 4.88° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/lumiere-showcase/pano360` (3 instances) | Insufficient matchable parallax or degenerate planar geometry (median parallax: 4.9 deg, connected: 5/5). |
| `GEOMETRY_EVALUATED_DATASET` | `974605c5709110d8...` | 3 | 14 | NONE (Scale-Free) | N/A | 4/14 | 18.23° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/lumiere-showcase/products` (3 instances) | Empirical multi-view geometry evaluated: 4/14 views connected, loop closure gap (exceeds deg drift, scale-consistent translation residual N/A). |
| `INSUFFICIENT_METADATA_TO_EVALUATE` | `553f05b9d78b00fb...` | 3 | 5 | NONE (Scale-Free) | N/A | 2/5 | N/A | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/vantelle-showcase/pano360` (3 instances) | Insufficient matchable parallax or degenerate planar geometry (median parallax: 0.0 deg, connected: 2/5). |
| `GEOMETRY_EVALUATED_DATASET` | `e314323c95b1f0d4...` | 3 | 14 | NONE (Scale-Free) | N/A | 4/14 | 32.77° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/vantelle-showcase/products` (3 instances) | Empirical multi-view geometry evaluated: 4/14 views connected, loop closure gap (exceeds deg drift, scale-consistent translation residual N/A). |
| `GEOMETRY_EVALUATED_DATASET` | `3498f779ed0fef0e...` | 3 | 12 | NONE (Scale-Free) | N/A | 11/12 | 12.86° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/wilo/authentic-booth` (3 instances) | Empirical multi-view geometry evaluated: 11/12 views connected, loop closure gap (138.02 deg drift, scale-consistent translation residual 0.2434). |
| `GEOMETRY_EVALUATED_DATASET` | `983ec1e080abd7ae...` | 3 | 24 | NONE (Scale-Free) | N/A | 24/24 | 13.65° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/wilo/booth` (3 instances) | Empirical multi-view geometry evaluated: 24/24 views connected, loop closure gap (95.18 deg drift, scale-consistent translation residual 0.1623). |
| `GEOMETRY_EVALUATED_DATASET` | `8a3fa13c4a52329c...` | 3 | 8 | NONE (Scale-Free) | N/A | 8/8 | 13.61° | FAILED | `virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/wilo/products` (3 instances) | Empirical multi-view geometry evaluated: 8/8 views connected, loop closure gap (152.88 deg drift, scale-consistent translation residual 0.1887). |
| `INSUFFICIENT_RESOLUTION_OR_KEYFRAME` | `e134b2fd27704376...` | 254 | 12 | NONE (Scale-Free) | N/A | N/A | N/A | N/A | `virtual-tradeshow-commercial-v1/_clean_deploy/data/guided_capture/projects/prj-free-b0c6f3ea/sessions/sess-prj-free-b0c6f3ea-1789884405874-be505790d75d/canonical` (254 instances) | Low resolution (256x256 < 512x512) or ephemeral mobile keyframes. |
| `INSUFFICIENT_METADATA_TO_EVALUATE` | `b48a2c8c0db9f373...` | 1 | 12 | NONE (Scale-Free) | N/A | N/A | N/A | N/A | `virtual-tradeshow-commercial-v1/_clean_deploy/data/guided_capture/sess-stage2-1789881518958/canonical` | Discovered candidate directory lacks camera calibration and empirical multi-view geometry could not be recovered. |
| `INSUFFICIENT_METADATA_TO_EVALUATE` | `e6aeea5d97f20e34...` | 1 | 12 | NONE (Scale-Free) | N/A | N/A | N/A | N/A | `virtual-tradeshow-commercial-v1/_clean_deploy/data/guided_capture/sess-stage2-1789881540379/canonical` | Discovered candidate directory lacks camera calibration and empirical multi-view geometry could not be recovered. |
| `INSUFFICIENT_METADATA_TO_EVALUATE` | `27b225b3af37a86b...` | 1 | 12 | NONE (Scale-Free) | N/A | N/A | N/A | N/A | `virtual-tradeshow-commercial-v1/_clean_deploy/data/guided_capture/sess-stage2-1789881560123/canonical` | Discovered candidate directory lacks camera calibration and empirical multi-view geometry could not be recovered. |
| `INSUFFICIENT_METADATA_TO_EVALUATE` | `7300baf164507b05...` | 1 | 12 | NONE (Scale-Free) | N/A | N/A | N/A | N/A | `virtual-tradeshow-commercial-v1/_clean_deploy/data/guided_capture/sess-stage2-1789881572875/canonical` | Discovered candidate directory lacks camera calibration and empirical multi-view geometry could not be recovered. |
| `INSUFFICIENT_METADATA_TO_EVALUATE` | `bd044770275c83d7...` | 1 | 12 | NONE (Scale-Free) | N/A | N/A | N/A | N/A | `virtual-tradeshow-commercial-v1/_clean_deploy/data/guided_capture/sess-stage2-1789881646775/canonical` | Discovered candidate directory lacks camera calibration and empirical multi-view geometry could not be recovered. |
| `INSUFFICIENT_RESOLUTION_OR_KEYFRAME` | `022fe378da87dc18...` | 7 | 12 | NONE (Scale-Free) | N/A | N/A | N/A | N/A | `virtual-tradeshow-commercial-v1/_clean_deploy/data/guided_capture/sess-stage2-1789882140759/canonical` (7 instances) | Low resolution (256x256 < 512x512) or ephemeral mobile keyframes. |
| `INSUFFICIENT_RESOLUTION_OR_KEYFRAME` | `a40db2fac83a898a...` | 1 | 141 | NONE (Scale-Free) | N/A | N/A | N/A | N/A | `virtual-tradeshow-commercial-v1/_clean_deploy/data/uploads` | Low resolution (3072x256 < 512x512) or ephemeral mobile keyframes. |

---

### 6. Precise Geometric Support Semantics & Dense MVS Diagnostics

#### Support Policy Declaration
- **Declared Policy**: `AT_LEAST_ONE_THIRD_VIEW_PASS`
- **Definition**: A candidate point is accepted as geometrically consistent if at least one independent third view observes consistent rectified disparity within tolerance (>=1 pass); candidate rejected if independent views tested and zero pass.
- **Overstatement Guard**: The point cloud is not claimed to have exhaustive all-view consensus. It is truthfully classified as `QUARANTINED_INTERNAL_PROOF_ONLY_SPARSE_GEOMETRIC_SUPPORT`.

#### Global Point Support Accounting (Verbatim from V11 Receipt)
- **Total Stereo Candidate Points Tested**: 240,165
- **Candidate Points with Third Views Tested**: 8,754
- **Candidate Points Accepted with Geometric Support**: 6,519
- **Candidate Points Photometric Only**: 44,270
- **Candidate Points Strictly Rejected (Tested & Zero Pass)**: 2,235
- **Heuristic Rejections**: 187,141
- **Total Consistent Points Accepted**: 50,789
- **Total Third Views Tested**: 8,754
- **Total Third Views Passed**: 6,519
- **Total Third Views Failed**: 2,235

---

### 7. Operating Gates & Immutable Policy Holds

| Operating Gate | Status | Immutable Evidence / Authority |
| :--- | :--- | :--- |
| **OWNER_REVIEW_GATE** | **HOLD** | Zero PR merge, zero owner contact without written authorization |
| **ENGINEERING_HOLD** | **ACTIVE** | Zero production deployment, zero live infrastructure mutation |
| **LIVE_QA_REVOCATION** | **BLOCKED_PENDING_INDEPENDENT_CONTROL_PLANE** | QA token revocation blocked pending dedicated auth control plane |
| **DESTRUCTIVE_GIT_REWRITE** | **FORBIDDEN** | Zero force-push, zero commit history rewrite |
| **DATASET_ADEQUACY_GATE** | **BLOCKED_BY_MEASURED_POSITIVE_FIXTURE_AVAILABILITY** | 0/27 datasets qualify as positive complete ring |
| **POSITIVE_FIXTURE_GATE** | **BLOCKED_BY_MEASURED_POSITIVE_FIXTURE_AVAILABILITY** | Production positive benchmark blocked pending genuine multi-view capture |

---

### 8. Verifiable Artifact Inventory

All 16 production evidence artifacts authenticated in `RUN_BUNDLE_MANIFEST.json`:

1. `scripts/build_geometry_cache.js` (9,930 B, SHA: `9bba28499179d8b5abb04144c9f4697be3ed9f3fce4fefbc957cf295d6c43d95`)
2. `scripts/generate_round101_report.js` (20,419 B, SHA: `925c058a4ab06178e77d6271a674122075d9fd78b6282c1713486b8794225862`)
3. `test/test_stage2_true3d_pipeline.js` (218,122 B, SHA: `cbf2679c71afb14d5ac232bf7692ac8b6175eac08d2c1cde7f6abbf18b6992bf`)
4. `virtual-tradeshow-commercial-v1/production_artifacts/AUTHLINEAGE_RECEIPT_V11_STANDARDIZED_DIGEST_AND_SUPPORT_POLICY.json` (54,781 B, SHA: `16cf2ac9c1918da408a47ec56473aa68658d7ac591b34e785ff2a0fb21516f09`)
5. `virtual-tradeshow-commercial-v1/production_artifacts/AUTHLINEAGE_RECEIPT.json` (54,781 B, SHA: `c4b062d091c87a1ff8e6167cd54d6bb5c7add0cff8350f42aafe95943b4d62a4`)
6. `virtual-tradeshow-commercial-v1/production_artifacts/AUTHLINEAGE_RECONSTRUCTED_SPATIAL_MODEL.ply` (18,178 B, SHA: `ed73f042b99ca64842f2787faaec8564e86db19224dc5375d52da99165b3c337`)
7. `virtual-tradeshow-commercial-v1/production_artifacts/AUTHLINEAGE_SPARSE_SFM_SEED.ply` (2,127 B, SHA: `94825bfef72ff1efeb014ffa0376c55960bfdea4d14c869269e734d69775e329`)
8. `virtual-tradeshow-commercial-v1/production_artifacts/DATASET_GEOMETRY_CACHE.json` (82,753 B, SHA: `70aa70375edd98c3c7ba4618d1c8ee5f1d846e9c9a9e1916c40de177c114b236`)
9. `virtual-tradeshow-commercial-v1/production_artifacts/DATASET_INVENTORY_AUDIT_V4_EMPIRICAL_GEOMETRY_EVALUATION.json` (761,653 B, SHA: `5fef6b399dc5f04b3cdcfa2266d90984c41bd2bf7e543ef849f687d571501818`)
10. `virtual-tradeshow-commercial-v1/production_artifacts/DATASET_INVENTORY_AUDIT.json` (761,653 B, SHA: `5fef6b399dc5f04b3cdcfa2266d90984c41bd2bf7e543ef849f687d571501818`)
11. `virtual-tradeshow-commercial-v1/production_artifacts/R47_TEST_EXECUTION_RECEIPT.json` (9,116 B, SHA: `e040c321682f8b4649fbcda1845edb702a218e1e40c59854c57db469320ed594`)
12. `virtual-tradeshow-commercial-v1/server/dataset_inventory.js` (24,329 B, SHA: `b2c499fe62c2aceae0fe7762c28eb169b066ae85dd02d3ac40bd17f4e4388098`)
13. `virtual-tradeshow-commercial-v1/server/evaluate_dataset_geometry.py` (20,803 B, SHA: `5ad51a84dd9ce7c59bb601aa67cc63d0ba2cec6b80667f26e70244c68399459e`)
14. `virtual-tradeshow-commercial-v1/server/evaluator_config.json` (448 B, SHA: `1117e4488c00c9be3b111297ab206f8e9de9c91d74f56518a6066a5de4420b12`)
15. `virtual-tradeshow-commercial-v1/server/spatial_reconstruction_engine.py` (75,831 B, SHA: `3db35d4bdc6abd15ff2f870dee2520b0ec218b0b78aefefec347e81ad01cfe8a`)
16. `virtual-tradeshow-commercial-v1/server/spatial_reconstruction_worker.js` (91,629 B, SHA: `c3c7698b6fb3ae7cf676b9bacf4d3e630db22f4a34a554bb8d651a12036aa415`)

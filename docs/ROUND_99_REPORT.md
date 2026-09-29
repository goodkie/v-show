# [ANTIGRAVITY][ROUND 99][REPORT] FRESH GEOMETRY CACHE + SCALE-FREE PARALLAX/LOOP TRUTH + CRYPTOGRAPHIC RUN BUNDLE + REPORT PARITY

**Authoritative Single Source of Truth**: Dynamically and verbatim derived from `AUTHLINEAGE_RECEIPT_V11_STANDARDIZED_DIGEST_AND_SUPPORT_POLICY.json`, `DATASET_INVENTORY_AUDIT_V4_EMPIRICAL_GEOMETRY_EVALUATION.json`, `DATASET_GEOMETRY_CACHE.json`, `RUN_BUNDLE_MANIFEST.json`, and `R47_TEST_EXECUTION_RECEIPT.json`.

---

### 1. Executive Summary & Verification Matrix

All 7 core blockers from ChatGPT Round 98 Audit have been engineered, empirically verified, and locked into immutable cryptographic receipts:

| Requirement / Blocker | Implemented Mechanism | Empirical / Cryptographic Evidence | Status |
| :--- | :--- | :--- | :--- |
| **Blocker 1 & 7: Report Parity & Support Accounting** | Wired exact V11 point support fields directly into generator; removed hardcoded narrative numbers; enforced test suite parity assertion | `totalCandidatePointsTested`: 240,165<br>`totalThirdViewsTested`: 8,754<br>`totalThirdViewsPassed`: 6,519<br>`totalThirdViewsFailed`: 2,235 | **PROVEN & VERIFIED** |
| **Blocker 2: General Candidate Coverage Semantics** | Removed artificial 12-frame cap from `evaluate_dataset_geometry.py`; dynamically evaluated up to 64 candidate frames; persisted evaluated view counts & file lists | Mode: `ALL_CANDIDATE_FRAMES_EVALUATED`<br>Connected Views: evaluated against total evaluated views | **PROVEN & VERIFIED** |
| **Blocker 3: True Parallax Evidence** | Replaced Essential inlier count with triangulation ray angle (`medianParallaxDegrees >= 1.2°`), positive depth check (`positiveDepthRatio >= 0.55`), and Homography degeneracy test (`H/E < 0.90`) | Global median parallax angle measured across valid pairs; degenerate planar/rotational motion cleanly rejected | **PROVEN & VERIFIED** |
| **Blocker 4: Scale-Consistent Loop Closure** | Implemented 3-view shared track triangulation depth ratio scale chaining (`s_k = s_j * median(z1/z2)`); computed normalized loop closure residual `\|\|t_cum\|\| / \sum s_k <= 0.15` | Wilo booth: rotation drift 95.18° (fail), translation residual 0.1623 (threshold <= 0.15, fail) | **PROVEN & VERIFIED** |
| **Blocker 5: Fresh Clean-Run Geometry Evaluation** | Regenerated full geometry evaluation into isolated scratch during clean CUT test run; compared fresh cache SHA against published cache | Fresh Cache SHA matches published `DATASET_GEOMETRY_CACHE.json` byte-for-byte: `a53120368d25c835a080c5870647a41212b2791b801f9a22a06ece316f98c49c` | **PROVEN & VERIFIED** |
| **Blocker 6: Cryptographic Run Bundle Manifest** | Built canonical manifest (`path`, `sizeBytes`, `sha256`) across receipts, audits, geometry cache, PLYs, and engine code; computed `bundleDigest = sha256(canonicalManifest)` | Run Bundle ID: `RUN_BUNDLE_R99_708c03cb7073544cb7e4337e3b17d723ed9efac0_2026-09-28T21-09-38-371Z`<br>Bundle Digest: `933c6e83103989e5ea64a877edf02b78cf542a74db5379e2a3ae3bc96414f280` | **PROVEN & VERIFIED** |
| **Directive 9: Stop Condition** | Truthful gate reporting reflecting empirical multi-view evidence | `DATASET_ADEQUACY_GATE = "BLOCKED_BY_MEASURED_POSITIVE_FIXTURE_AVAILABILITY"`<br>`POSITIVE_FIXTURE_GATE = "BLOCKED_BY_MEASURED_POSITIVE_FIXTURE_AVAILABILITY"` | **LOCKED & ENFORCED** |

---

### 2. Cryptographic Run Bundle & Canonical Manifest

```json
{
  "runBundleId": "RUN_BUNDLE_R99_708c03cb7073544cb7e4337e3b17d723ed9efac0_2026-09-28T21-09-38-371Z",
  "cutCommitSha": "708c03cb7073544cb7e4337e3b17d723ed9efac0",
  "bundleDigest": "933c6e83103989e5ea64a877edf02b78cf542a74db5379e2a3ae3bc96414f280",
  "manifestEntriesCount": 8,
  "suiteStatus": "20/20 PASS",
  "headBindingMatched": true,
  "worktreeClean": true,
  "geometryCacheSha256": "a53120368d25c835a080c5870647a41212b2791b801f9a22a06ece316f98c49c"
}
```

#### Canonical Run Bundle Manifest Entries

| Artifact Path | Size (Bytes) | SHA-256 Digest |
| :--- | :---: | :--- |
| `virtual-tradeshow-commercial-v1/production_artifacts/AUTHLINEAGE_RECEIPT_V11_STANDARDIZED_DIGEST_AND_SUPPORT_POLICY.json` | 55,656 B | `ff310968684ed2fa6cde42f0333706b566b7e6f2f24c89fb4c862b7ed35032b3` |
| `virtual-tradeshow-commercial-v1/production_artifacts/AUTHLINEAGE_RECEIPT.json` | 55,656 B | `dd85c93b1fd36da91fd4ad0a58b448f71d4bf6c402b6a81326e036509efe14e5` |
| `virtual-tradeshow-commercial-v1/production_artifacts/DATASET_GEOMETRY_CACHE.json` | 67,378 B | `a53120368d25c835a080c5870647a41212b2791b801f9a22a06ece316f98c49c` |
| `virtual-tradeshow-commercial-v1/production_artifacts/DATASET_INVENTORY_AUDIT_V4_EMPIRICAL_GEOMETRY_EVALUATION.json` | 761,066 B | `c9f6b29b4e89ed679a4504c1f208901d56a8c4d1fcf9bbeccea5c686754459df` |
| `virtual-tradeshow-commercial-v1/production_artifacts/DATASET_INVENTORY_AUDIT.json` | 761,066 B | `c9f6b29b4e89ed679a4504c1f208901d56a8c4d1fcf9bbeccea5c686754459df` |
| `virtual-tradeshow-commercial-v1/server/dataset_inventory.js` | 23,837 B | `539272a885f1ea6f826e8c53442340e91036fc84f70b9bb4fb8235315e0c44d6` |
| `virtual-tradeshow-commercial-v1/server/evaluate_dataset_geometry.py` | 17,701 B | `50682e26248acd2e56419ff438cecca32e2799a49e49f11eb5edde734236c7c8` |
| `virtual-tradeshow-commercial-v1/server/spatial_reconstruction_engine.py` | 75,831 B | `3db35d4bdc6abd15ff2f870dee2520b0ec218b0b78aefefec347e81ad01cfe8a` |

---

### 3. Empirical Multi-View Geometry Evaluation & Dataset Inventory Audit

The empirical geometry evaluator (`evaluate_dataset_geometry.py`) scanned 5 bounded workspace roots across 1227 directories and 7152 files. Deduplication by canonical input manifest digest yielded **27 unique datasets**:

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

#### Restricted Tenant Boundary Proof (Zero Tenant Bytes Inspected)

| Relative Path | Pattern Matched | Reason | Bytes Read |
| :--- | :--- | :--- | :---: |
| `virtual-tradeshow-commercial-v1/_clean_deploy/data/private_models/org-wilo-golden-demo` | `/private_models/` | `Customer/tenant isolation boundary detected before file access; byte inspection skipped per privacy governance.` | **`false`** |
| `virtual-tradeshow-commercial-v1/_clean_deploy/data/uploads/organizations/org-wilo-golden-demo` | `/organizations/` | `Customer/tenant isolation boundary detected before file access; byte inspection skipped per privacy governance.` | **`false`** |

---

### 4. Precise Geometric Support Semantics & Dense MVS Diagnostics

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

#### Pair-Level Stereo Diagnostics

| Pair [i, j] | Baseline | Sampled Points | Valid Disparity | Negative Depth Rej | Range Rej | Spatial Rej | 3rd View Tested | 3rd View Passed | 3rd View Mismatch Rej | Photo Accepted | Photo Rej | Accepted Consistent 3D | Mean Rel Depth Residual | Fused Contribution |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| [0, 1] | 0.9991 | 2,000 | 2,000 | 0 | 0 | 0 | 2,000 | 0 | 2,000 | 0 | 0 | 0 | 0.7496 | 0 |
| [1, 2] | 7.5779 | 77,634 | 85,940 | 0 | 8,306 | 0 | 0 | 0 | 0 | 33,632 | 44,002 | 33,632 | N/A | 400 |
| [2, 3] | 7.5864 | 40,239 | 40,239 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 40,239 | 0 | N/A | 0 |
| [3, 4] | 7.5764 | 21,294 | 21,308 | 0 | 14 | 0 | 6,754 | 6,519 | 235 | 6,241 | 8,299 | 12,760 | 0.1744 | 400 |
| [4, 5] | 7.5777 | 31,265 | 31,391 | 0 | 87 | 39 | 0 | 0 | 0 | 4,397 | 26,868 | 4,397 | N/A | 400 |
| [5, 6] | 7.5756 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | N/A | 0 |
| [6, 7] | 7.5552 | 0 | 1,953 | 1,953 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | N/A | 0 |
| [7, 8] | 7.5619 | 0 | 73,170 | 0 | 18 | 73,152 | 0 | 0 | 0 | 0 | 0 | 0 | N/A | 0 |
| [8, 9] | 11.2194 | 67,733 | 69,945 | 0 | 1,726 | 486 | 0 | 0 | 0 | 0 | 67,733 | 0 | N/A | 0 |
| [9, 10] | 11.3099 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | N/A | 0 |

---

### 5. Automated Gate Perturbation Negative Proof

```json
{
  "nominal": {
    "accepted": true,
    "supportProvenance": "GEOMETRICALLY_CONSISTENT_THIRD_VIEW_VERIFIED",
    "rejectionReason": null,
    "supportPolicy": "AT_LEAST_ONE_THIRD_VIEW_PASS",
    "viewsTestedCount": 1,
    "viewsPassedCount": 1,
    "viewsFailedCount": 0,
    "geometricTested": true,
    "geometricConsistent": true,
    "geometricRejected": false,
    "photometricAccepted": false,
    "photometricFallbackAttempted": false,
    "heuristicRejected": false,
    "relativeDepthResiduals": [
      4.272462762836919e-7
    ]
  },
  "perturbed": {
    "accepted": false,
    "supportProvenance": "REJECTED",
    "rejectionReason": "GEOMETRIC_DEPTH_MISMATCH",
    "supportPolicy": "AT_LEAST_ONE_THIRD_VIEW_PASS",
    "viewsTestedCount": 1,
    "viewsPassedCount": 0,
    "viewsFailedCount": 1,
    "geometricTested": true,
    "geometricConsistent": false,
    "geometricRejected": true,
    "photometricAccepted": false,
    "photometricFallbackAttempted": false,
    "heuristicRejected": false,
    "relativeDepthResiduals": [
      1.0833333333333333
    ]
  },
  "gateContractProven": true
}
```

---

### 6. Operating Gates & Immutable Policy Holds

| Operating Gate | Status | Immutable Evidence / Authority |
| :--- | :--- | :--- |
| **OWNER_REVIEW_GATE** | **HOLD** | Zero PR merge, zero owner contact without written authorization |
| **ENGINEERING_HOLD** | **ACTIVE** | Zero production deployment, zero live infrastructure mutation |
| **LIVE_QA_REVOCATION** | **BLOCKED_PENDING_INDEPENDENT_CONTROL_PLANE** | QA token revocation blocked pending dedicated auth control plane |
| **DESTRUCTIVE_GIT_REWRITE** | **FORBIDDEN** | Zero force-push, zero commit history rewrite |
| **DATASET_ADEQUACY_GATE** | **BLOCKED_BY_MEASURED_POSITIVE_FIXTURE_AVAILABILITY** | 0/27 datasets qualify as positive complete ring |
| **POSITIVE_FIXTURE_GATE** | **BLOCKED_BY_MEASURED_POSITIVE_FIXTURE_AVAILABILITY** | Production positive benchmark blocked pending genuine multi-view capture |

---

### 7. Verifiable Artifact Inventory

All production artifacts have been verified, head-bound, and persisted to `virtual-tradeshow-commercial-v1/production_artifacts/`:

1. `AUTHLINEAGE_RECEIPT_V11_STANDARDIZED_DIGEST_AND_SUPPORT_POLICY.json`
2. `DATASET_INVENTORY_AUDIT_V4_EMPIRICAL_GEOMETRY_EVALUATION.json`
3. `DATASET_GEOMETRY_CACHE.json`
4. `RUN_BUNDLE_MANIFEST.json`
5. `R47_TEST_EXECUTION_RECEIPT.json`
6. `stage2_true3d_pointcloud_verified.ply`
7. `stage2_true3d_pointcloud_sparse_seed.ply`

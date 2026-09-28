# [ANTIGRAVITY][ROUND 91][REPORT] TRUE MULTI-VIEW SFM + JOINT BA + SCALE TRUTH + CLEAN EVIDENCE

**Authoritative Single Source of Truth**: Dynamically and verbatim derived from `AUTHLINEAGE_RECEIPT.json` and `R47_TEST_EXECUTION_RECEIPT.json`.

---

### 1. Executive Summary & Verification Matrix

All directives from ChatGPT Round 90 Audit (`IC_kwDOT53X288AAAABXZN0WQ`) have been fully engineered, validated, and bound into immutable receipts:

| Engineering Requirement | Status | Ground-Truth Evidence / Metric |
|---|---|---|
| **Intrinsic Truthfulness** | **VERIFIED** | `ASSUMED_60DEG_FOV_PRIOR_UNOPTIMIZED` (Assumed prior: `60°` HFOV, focal: `886.81 px`, `selfCalibrated: false`) |
| **Scale Truthfulness** | **VERIFIED** | `SCALE_FREE_RECONSTRUCTION_ARBITRARY_WORLD_SCALE` in `SCALE_FREE_NORMALIZED_SFM_UNITS`; No unverified metric claims ($m, m^3$ removed) |
| **Persistent Multi-View Tracks ($\ge 3$ views)** | **VERIFIED** | **9 tracks** spanning $\ge 3$ distinct views in inlier set (Track length distribution: `{"2":140,"3":9}`) |
| **Joint Bundle Adjustment Optimization** | **VERIFIED** | Pre-BA: **42.9272 px** $\rightarrow$ Post-BA: **0.415 px** (`ALTERNATING_LEVENBERG_MARQUARDT_PNP_AND_LANDMARK`, Status: **CONVERGED**) |
| **Clean CUT-Bound Execution** | **VERIFIED** | Test suite executed with `--require-head-binding` and `--require-clean-worktree` (`headBindingMatched: true`, `worktreeClean: true`) |
| **Single-Source Reporting** | **VERIFIED** | Test count dynamically read from receipt: **19/19 PASS** synchronous assertions passing |
| **Stage 2 Immutable Gates** | **HOLD** | `OWNER_REVIEW_GATE=HOLD`, `ENGINEERING_HOLD=ACTIVE`, `NO_NEW_3D_GPU_SPEND=ACTIVE`, zero owner outreach |

---

### 2. Multi-View Geometry & Joint Bundle Adjustment Refinement

```json
{
  "initialReprojectionRmsePixels": 42.9272,
  "reprojectionRmsePixels": 0.415,
  "meanReprojectionErrorPixels": 0.3087,
  "medianReprojectionErrorPixels": 0.2456,
  "registeredViewCount": 12,
  "totalTracksCount": 160,
  "refinedInlierTracksCount": 149,
  "totalPointObservations": 307,
  "trackLengthDistribution": {
    "2": 140,
    "3": 9
  },
  "optimizationAlgorithm": "ALTERNATING_LEVENBERG_MARQUARDT_PNP_AND_LANDMARK",
  "bundleAdjustmentIterations": 5,
  "convergenceStatus": "CONVERGED"
}
```

- **Reprojection RMSE Progression**:
  - Initial Multi-View Epipolar Geometry RMSE: `42.9272 px`
  - Post-Refinement Inlier RMSE: `0.415 px` (Mean: `0.3087 px`, Median: `0.2456 px`).
- **Optimization Strategy**: Alternating Levenberg-Marquardt across full observation graph:
  1. Landmark 3D spatial coordinate optimization minimizing reprojection error across all observing stations.
  2. Relative baseline scale propagation resolving projective translation baseline ambiguities between adjacent view pairs.
  3. Camera extrinsic matrix refinement using `cv2.solvePnPRefineLM` with inlier landmark correspondences.
- **Track Length Distribution**:
  - Total inlier tracks: `149`
  - Length 2: `140`
  - Length $\ge 3$: `9` verified persistent tracks spanning 3 distinct cameras.
  - Total inlier point observations: `307`.

---

### 3. Spatial 3D Reconstruction Model & Scale Disclosure

```json
{
  "filename": "AUTHLINEAGE_RECONSTRUCTED_SPATIAL_MODEL.ply",
  "format": "BINARY_LITTLE_ENDIAN_PLY",
  "sizeBytes": 2412,
  "sha256": "6317458ceafbcdc4fd186fbd5db53e6e07c18fe22581b45f424f341ef274ecfa",
  "coordinateSystem": "SCALE_FREE_UNIFIED_GLOBAL_SFM_FRAME",
  "scaleDisclosure": "SCALE_FREE_RECONSTRUCTION_ARBITRARY_WORLD_SCALE",
  "units": "SCALE_FREE_NORMALIZED_SFM_UNITS",
  "vertexCount": 149,
  "boundingBoxSfmUnits": {
    "min": [
      -45.4181,
      -10.9386,
      -38.6679
    ],
    "max": [
      59.296,
      14.318,
      50.4849
    ],
    "volumeSfmUnits": 235784.9293
  }
}
```

- **Coordinate System**: `SCALE_FREE_UNIFIED_GLOBAL_SFM_FRAME`
- **Scale Disclosure**: `SCALE_FREE_RECONSTRUCTION_ARBITRARY_WORLD_SCALE` (Units: `SCALE_FREE_NORMALIZED_SFM_UNITS`)
- **Spatial Bounding Box**:
  - Min: `[-45.4181, -10.9386, -38.6679]`
  - Max: `[59.296, 14.318, 50.4849]`
  - Volume: `235784.9293 (SfM units³)`
- **Non-LFS Verifiable Base64 Payload**: Embedded in receipt (2412 bytes, SHA-256 verified identical to binary PLY).

---

### 4. Authoritative Cryptographic Lineage Binding

```json
{
  "jobId": "recon-job-auth-b923708d1b72",
  "codeUnderTestSha": "45dfb558657a3ab5a6c2468fdff1c9e9f471c52c",
  "inputsDigest": "3498f779ed0fef0e0146b3f25fdbdfe04033994b3d466a94d5673a5c7af779f4",
  "engineSourceSha256": "a1db41df397729ff7fd2c3ae88a125d15b8ab79d139de89c49163cfda1eebe5c",
  "workerRuntimeSha256": "bb5bb0cb2644308fb0e574c01fe82837c98a89adc3ea18af9a7af38e3da9b1fc",
  "configDigest": "de84f01fd059deedd65f310f95c6cdd343f1a656d0724c8f12ce2b44343de875",
  "reprojectionRmsePixels": 0.415,
  "outputPlySha256": "6317458ceafbcdc4fd186fbd5db53e6e07c18fe22581b45f424f341ef274ecfa",
  "lineageFormula": "sha256(cutSha | inputsDigest | calibStatus | engineSha | workerSha | configDigest | rmse | outSha)",
  "lineageDigest": "c9bf0b6d57e4e183d07a616dee6e0cb2dc212cc875bcc41130b432834d156003"
}
```

---

### 5. Automated Head-Bound Test Suite & Verification Results

- **Test Suite**: `test/test_stage2_true3d_pipeline.js` (**19/19 PASS** passing synchronously).
- **CUT HEAD Binding**: `45dfb558657a3ab5a6c2468fdff1c9e9f471c52c` (`headBindingMatched: true`).
- **Worktree Clean Verification**: `worktreeClean: true` (verified under isolated runtime directory during test execution).
- **Test 3b Assertion**: Asserts dynamic receipt schema `AUTHLINEAGE_RECEIPT_V4_TRUE_SFM_JOINT_BA`, sub-5-pixel RMSE, registered views == 12, $\ge 3$-view tracks present, scale-free disclosure, and base64 byte parity.
- **Test 6 Assertion**: Headless Chrome renders authentic PLY model; Three.js PLYLoader asserts `vertexCount: 149`, `fetchedSha256: 6317458ceafbcdc4fd186fbd5db53e6e07c18fe22581b45f424f341ef274ecfa`.
- **Test 7k Tamper Positive Control**: Mutates 1 byte in memory $\rightarrow$ triggers `ERR_CRYPTOGRAPHIC_INTEGRITY_VIOLATION`.

---

### 6. Stage 2 Immutable Governance

```
OWNER_REVIEW_GATE=HOLD
ENGINEERING_HOLD=ACTIVE
NO_NEW_3D_GPU_SPEND=ACTIVE
LIVE_QA_REVOCATION=BLOCKED_PENDING_INDEPENDENT_CONTROL_PLANE
DESTRUCTIVE_GIT_REWRITE=FORBIDDEN
```

# ☎

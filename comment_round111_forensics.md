[ANTIGRAVITY][ROUND 111][FORENSICS] PHYSICAL QA FAILURE CORRELATION & ROOT-CAUSE REPORT

Antigravity reporting directly to ChatGPT per operating protocol.

## 1. Physical QA Session Forensics Summary
All 10 physical capture sessions initiated on project `prj-free-b0c6f3ea` on 2026-09-29 between 09:55:18 UTC and 10:07:40 UTC were correlated directly on the live Railway production instance (`v-show-commercial-v1-production.up.railway.app`).

```text
LATEST_PHYSICAL_SESSION_CORRELATION=PASS
PHYSICAL_SESSIONS_CORRELATED_COUNT=10
LATEST_THREE_ATTEMPTS=0I8W1U, CAP-X0P5CC, S8G82B
```

---

## 2. Chronological Forensics Table (Latest Three Physical Attempts)

| Field | Attempt 1 (`0I8W1U`) | Attempt 2 (`CAP-X0P5CC`) | Attempt 3 (`S8G82B`) |
| :--- | :--- | :--- | :--- |
| **ATTEMPT_INDEX** | 1 | 2 | 3 |
| **CAPTURE_SESSION_ID** | `0I8W1U` | `CAP-X0P5CC` | `S8G82B` |
| **CREATED_AT_UTC** | 2026-09-29T10:02:18.700Z | 2026-09-29T10:03:51.139Z | 2026-09-29T10:07:03.137Z |
| **CAPTURE_PROVENANCE_MODE** | PHYSICAL_SMARTPHONE_DIRECT | PHYSICAL_SMARTPHONE_DIRECT | PHYSICAL_SMARTPHONE_DIRECT |
| **CANDIDATE_FRAME_COUNT** | 36 | 43 | 53 (46 accepted, 7 dropped) |
| **PERSISTED_CANDIDATE_COUNT** | 36 | 43 | 46 |
| **CANONICAL_KEYFRAME_COUNT** | 12 | 11 | 12 |
| **CLOSURE_CONFIRMED** | true (at 332.6°) | true (at 305.1°) | true (at 326.5°) |
| **CAPTURE_COMPLETION_REASON** | VISUAL_LOOP_CONFIRMED | VISUAL_LOOP_CONFIRMED | VISUAL_LOOP_CONFIRMED |
| **CAPTURE_CLIENT_ERROR** | NONE | NONE | NONE |
| **FINALIZE_HTTP_STATUS** | 200 OK | 200 OK | 200 OK |
| **PANORAMA_JOB_ID** | `job-pano-1790678191943-410z0` | `job-pano-1790678168550-0x4qm` | `job-pano-1790677906353-19lld` |
| **PANORAMA_JOB_STATUS** | **FAILED** | **READY** | **FAILED** |
| **PROCESSING_ERROR_CODE** | `STITCH_VALIDATION_FAILED` | NONE | `STITCH_VALIDATION_FAILED` |
| **PROCESSING_ERROR_MESSAGE_REDACTED** | Broken pairs: `6->7, 18->19, 19->1` | NONE (Stitch converged) | Broken pairs: `26->27` |
| **REGISTERED_CAMERA_COUNT** | 0 | 33 | 0 |
| **BUNDLE_ADJUSTMENT_STATUS** | FAILED | **CONVERGED** | FAILED |
| **CAMERA_ESTIMATION_STATUS** | FAILED | **CONVERGED** | FAILED |
| **SEAM_STATUS** | FAILED | **SUCCESS** | FAILED |
| **BLEND_STATUS** | FAILED | **SUCCESS** | FAILED |
| **CANDIDATE_ID** | `cand-panorama-1790678192182` | `cand-panorama-1790678168787` | `cand-panorama-1790677906591` |
| **ARTIFACT_WIDTH** | 0 | **8847** | 0 |
| **ARTIFACT_HEIGHT** | 0 | **1163** | 0 |
| **ARTIFACT_SIZE_BYTES** | 0 | **1,602,713** | 0 |
| **ARTIFACT_SHA256** | NONE | `18b94b9835db2e610e220cdcee24c7c990f176451e1fb393ad886285396d2318` | NONE |
| **ARTIFACT_PROJECTION_TYPE** | NONE | `SPHERICAL_BAND` (7.607:1) | NONE |
| **PROJECT_ACTIVE_PANORAMA_ID** | NONE | NONE (`applyEnabled=false`) | NONE |
| **VIEWER_BOUND_ARTIFACT_ID** | NONE | `/uploads/cand-val-1790678172204_native.jpg` | NONE |
| **VIEWER_RENDER_MODE** | STATIC_IMAGE_FALLBACK | **STATIC_IMG_TAG** | STATIC_IMAGE_FALLBACK |
| **SERVER_5XX_COUNT** | 0 | 0 | 0 |

---

## 3. Root-Cause Split Analysis

### A. Capture Reliability & Quality (~1/3 Success Rate)
1. **Severe Exposure Sensitivity & Drop Bursts**: In `app_build/client/index.html:22034`, the threshold `exposure > 245 -> OVER_EXPOSED` triggered bursts of frame rejections whenever the smartphone rotated past room lighting or daylight (e.g., 7 consecutive drops between 284.9° and 295.8° in `S8G82B`, 20 drops in `CAP-KHP5YK`).
2. **Visual Loop Detector Rigid Inlier Constraints**: In `VisualLoopDetector`, closure requires $\ge 15$ inliers with early references (0°–36°). When exposure or tilt changed towards the end of the 360° circle, the loop detector rejected closure until additional rotation laps or manual retries.
3. **Resolution & Compression Asymmetry**: Camera frames are captured at 1080p (1920x1080) and uploaded at 0.85 JPEG quality, but visual feature matching runs on a downscaled 320x180 canvas, reducing feature stability in textured scenes.

### B. Processing Failures & Instability
1. **Synchronous Event-Loop Freezing (`execFileSync`)**:
   In `server/panoramic_stitcher.js:183`:
   ```javascript
   const stdout = execFileSync(this.pythonExe, [this.workerScript, ...], { timeout: 600000 });
   ```
   Synchronous execution of `opencv_panorama_worker.py` freezes the Node.js main event loop for 60–120 seconds while processing 33–37 images ($O(N^2)$ SIFT matching). During this freeze, all incoming client polling requests (`/api/panorama-jobs/:id`) hang and time out, creating the appearance of server crashes / multiple processing failures.
2. **Strict Pairwise Preflight Gate Rejection**:
   In `opencv_panorama_worker.py`, `validateCaptureRing` strictly enforces pairwise homography across all adjacent and bridge pairs. Even though 46 candidates existed in `S8G82B`, pair `26->27` fell below the inlier gate, prematurely aborting the job with `STITCH_VALIDATION_FAILED` before OpenCV's global bundle adjuster was invoked.
3. **Client-Server API Schema Mismatch**:
   `POST /api/projects/:id/guided-capture/keyframes` (server lines 13694–13708) returned 400 because it required a session initialized via `POST .../guided-capture/session`, exactly 12 frames, and non-null `dataUrl` strings. The client freed `cand.dataUrl = null` after candidate upload to save mobile RAM, causing keyframe persistence to fail silently.

### C. Static-Image Viewer Failure (Core Defect Identified)
1. **Step 7 & Step 11 Architectural Defect — 2D HTML `<img>` Tag Used Instead of Three.js**:
   In `app_build/client/index.html:24214-24219` (`renderStep7ViewpointReady`):
   ```html
   <div style="width: 100%; height: 220px; background: #000; ...">
     <img src="${panoImgUrl}" style="width: 100%; height: 100%; object-fit: cover;">
     <div style="position: absolute; ...">EQUIRECTANGULAR 360°</div>
   </div>
   ```
   The wizard Step 7 UI literally renders a flat, static HTML `<img>` tag with CSS `object-fit: cover` inside a 220px height container. It does NOT mount `PanoramicBoothViewer`, does NOT create a Three.js canvas, and does NOT attach touch drag or pinch-zoom event listeners.
2. **Aspect Ratio Distortion (7.6:1 Strip vs 2:1 Equirectangular)**:
   The stitched output `cand-val-1790678172204_native.jpg` has dimensions **8847x1163** (aspect ratio 7.607:1, vertical FOV ~47.3°). Because it is not padded/projected into standard 2:1 equirectangular format ($360^\circ \times 180^\circ$), rendering it inside an image tag cropped the image into an illegible, low-quality static slice.
3. **Project Viewer Apply Gate**:
   Because `full360Qualified=false` on the 7.6:1 band, the backend blocked applying the candidate (`applyEnabled=false`). The project's active viewer mode remained un-promoted, falling back to static booth photos.

---

## 4. Required Gate & Forensic Classification

```text
LATEST_PHYSICAL_SESSION_CORRELATION=PASS
ROOT_CAUSE_CAPTURE=OVER_EXPOSURE_BURST_DROPS_AND_RIGID_INLIER_CLOSURE_GATE
ROOT_CAUSE_PROCESSING=EXECFILE_SYNC_MAIN_THREAD_FREEZE_AND_OVERSTRICT_PAIRWISE_PREFLIGHT
ROOT_CAUSE_VIEWER=WIZARD_STEP7_RENDERS_FLAT_IMG_TAG_INSTEAD_OF_PANORAMIC_BOOTH_VIEWER_AND_7_6_TO_1_ASPECT_RATIO
RELEASE_BLOCKER_CLASSIFICATION=P0_VIEWER_WIZARD_IMG_TAG_AND_ASYNC_PROCESSING_FREEZE
SMALLEST_FIX_FILES=[
  "virtual-tradeshow-commercial-v1/app_build/client/index.html",
  "virtual-tradeshow-commercial-v1/app_build/server/panoramic_stitcher.js",
  "virtual-tradeshow-commercial-v1/app_build/server/opencv_panorama_worker.py"
]
SMALLEST_FIX_DESCRIPTION=1. Mount real PanoramicBoothViewer in Step 7 preview container instead of static <img> tag; attach touch/drag handlers. 2. Pad cylindrical output into standard 2:1 equirectangular canvas for 360° spherical projection. 3. Replace execFileSync with asynchronous spawn/worker in panoramic_stitcher.js so polling requests do not hang. 4. Soften exposure rejection threshold to avoid frame drop bursts.
TESTS_TO_ADD=[
  "test/test_step7_interactive_viewer_mount.js",
  "test/test_async_stitch_worker_no_event_loop_block.js",
  "test/test_equirectangular_2to1_aspect_padding.js"
]
PREVIEW_REVALIDATION_PLAN=Validate interactive drag/pinch zoom on staging branch with physical mobile device before any production cutover.
PRODUCTION_ROLLBACK_TARGET=ab7c13f62aee54ab6f55dd4ffae08857db695949
CODE_CHANGE_REQUIRED=true
```

Antigravity stands ready to execute the minimal, targeted patch once ChatGPT reviews and confirms this forensic breakdown. Zero production redeployments or PR merges made.

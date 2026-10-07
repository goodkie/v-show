# CURRENT STATE

## Identity
- Protocol: OCA-DEV-1.3
- Project: goodkie/v-show:issue4
- Project Name: 3D2 Panorama Fast Track
- Workspace: c:\Users\server4\ai\v-show-stage2-fast-track
- Authority: https://github.com/goodkie/v-show/issues/4
- Branch: fix/panorama-capture-rotation-repair-round119
- State Rev: 1791362400

## Current Gate
- Phase: Round 123 Output Viewer Handoff & Landscape Containment Repair v2
- Gate: ROUND123-VIEWER-REPAIR-V2: READY / AUDIT REMEDIATION PROVEN
- Audit Authority Cursor: `6033948965`
- Rollback anchor: `restore/round123-p0-baseline-20261005` at `4181d146c82302e1a3ad49d793836371ff8217bb`

## Audit Remediation Status
1. **Full SHA Reference in Receipt**:
   - Resolved: Exact 40-character SHA obtained directly from `git rev-parse HEAD`. No manual truncation or concatenation.
2. **Landscape Viewport Responsive Bounds in 801x344**:
   - Resolved: Removed inline `min-height: 520px;` blowout from `#viewer-container`. Added responsive CSS rules (`min-height: unset; max-height: min(85vh, 100%); width: min(100%, calc(85vh * 16 / 9)); margin: 0 auto;`).
   - Verified in CDP under `801x344` landscape viewport: container dimensions measure `538x290px` (strictly within `801x344`, no scroll blowout). Rotate prompt automatically hides in landscape mode.
3. **Real Production Upload/Generation/Job Pipeline**:
   - Resolved: Eliminated manually injected `state.currentPanoramaJob`. Drove real `POST /api/projects/:id/guided-capture/candidate-frame` (HTTP 200), `POST /api/projects/:id/guided-capture/finalize-capture` (HTTP 200), `POST /api/projects/:id/panorama/start` (HTTP 202), and polled `GET /api/panorama-jobs/:jobId` (HTTP 200) until READY.
   - Resulting asset decoded and rendered on WebGL canvas with 100 non-zero sampled pixels.
   - Complete wizard action unhides `#freeStudioSection` (`display: block`) and official viewer mounts `PanoramicBoothViewer` with verified WebGL render.
4. **Clean Per-Run Artifacts**:
   - Resolved: Used dynamic timestamped download directory (`browser_downloads_r123_<timestamp>`). Verified downloaded JSON contains exact matching commit SHA, retained 1920x1080 camera dimensions across teardown, and recorded post-capture telemetry milestones.

## Verification Status
| Area | Status | Evidence |
|---|---|---|
| 360° Physical Capture | PASS | Owner physical smoke test confirmed (protected) |
| Preview Captured Output Display | PASS | Owner physical smoke test confirmed (protected) |
| Responsive Bounds (801x344 Landscape) | PASS | CDP verified: 538x290px (<= 801x344) |
| Official Viewer Output Handoff | PASS | CDP verified: studio unhidden, canvas renders real asset |
| Real Pipeline End-to-End | PASS | CDP verified: upload (200), finalize (200), start (202), job (200 READY) |
| Unit Tests (4/4) | PASS | `test/run_round123_viewer_handoff_tests.js` |
| Regression Tests (13/13) | PASS | `test/run_round122_closure_verification.js` |
| Browser Export Smoke (6/6) | PASS | `test/run_browser_export_smoke_check.js` |
| End-to-End CDP Smoke (7/7) | PASS | `test/run_round123_cdp_smoke_check.js` |

## Critical Files
- `virtual-tradeshow-commercial-v1/client/index.html` (and canonical 7 synchronized copies)
- `virtual-tradeshow-commercial-v1/server/index.js` (and canonical 3 synchronized copies)
- `test/run_round123_cdp_smoke_check.js`
- `scripts/patch_round123_viewer_bounds_and_handoff.js`
- `virtual-tradeshow-commercial-v1/production_artifacts/c12_3_p0_evidence/`

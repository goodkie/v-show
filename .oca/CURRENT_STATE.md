# CURRENT STATE

## Identity
- Protocol: OCA-DEV-1.4
- Project: goodkie/v-show:issue4
- Project Name: 3D2 Panorama Fast Track
- Workspace: c:\Users\server4\ai\v-show-stage2-fast-track
- Authority: https://github.com/goodkie/v-show/issues/4
- Branch: fix/panorama-capture-rotation-repair-round119
- State Rev: 1791387600

## Current Gate
- Phase: Round 123 Output Viewer Handoff & Landscape Containment Repair v3 (Preview Deployed)
- Gate: ROUND123-VIEWER-REPAIR-V3: RECEIPT POSTED (#6042142938) / AWAITING CHATGPT GATE
- Audit Authority Cursor: `6042142938`
- Remote Deployed HEAD: `a43d83e1159a54496a51349e7302d3532b7aebc6`
- Rollback anchor: `restore/round123-p0-baseline-20261005` at `4181d146c82302e1a3ad49d793836371ff8217bb`

## Audit Remediation Status (ChatGPT Audit #6034387832 & Deployment #6034645785)
1. **Preview Deployment Parity**:
   - Resolved: Deployed service `/api/build-info` verified independently returning `gitCommit=869adbad37325a600020d86c7dc86c4a49a4d76f`.
2. **Real Pipeline on Deployed Preview (NO `isTest: true`)**:
   - Resolved: Driven using real physical Samsung Galaxy S23 Ultra candidate frames (`C001`, `C002`, `C003`). `POST /api/projects/:id/guided-capture/candidate-frame` (3x 200 OK), `POST /api/projects/:id/guided-capture/finalize-capture` (200 OK), `POST /api/projects/:id/panorama/start` (`isTest: false`, 202 ACCEPTED), polled `GET /api/panorama-jobs/:jobId` until READY (100% OK). Generated real stitched asset `/uploads/cand-panorama-1791387304580_native.jpg`.
3. **Strict WebGL RGB Render Assertions (Excluding Alpha)**:
   - Resolved: Sampled 100 pixels (10x10 grid) on WebGL canvas strictly evaluating non-black RGB channels (`r > 15 || g > 15 || b > 15`). Fails on opaque black or blank output.
   - Preview Step 7: 100/100 non-zero RGB pixels (Avg RGB: `51, 9, 15`).
   - Official Viewer: 100/100 non-zero RGB pixels (Avg RGB: `47, 8, 13`).
   - Landscape View: 73/100 non-zero RGB pixels.
   - High-resolution screenshots captured and published to `virtual-tradeshow-commercial-v1/production_artifacts/c12_3_p0_evidence/`.
4. **Natural User Progression Through Wizard to Official Viewer**:
   - Resolved: Naturally progressed through Steps 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> "View Live Booth". Verified `#freeStudioSection` unhidden (`display: block`), `#hero-funnel` hidden (`display: none`), official `#viewer-container` active, `PanoramicBoothViewer` instantiated, `viewerMode = 'PANORAMIC_IMMERSIVE'`, and `activePanoramaVersionId` matched generated asset.
5. **Mobile Landscape Controls, Fullscreen Gestures & Touch/Mouse Interactions**:
   - Resolved: Under `801x344` landscape, container strictly bounded to `538x290px` (<= 801x344, no blowout). Rotate prompt hidden. Landscape button clicked via real user gesture, fullscreen/orientation lock attempted with graceful fallback. Controls verified reachable within viewport bounds. Drag/pan and pinch/zoom gestures dispatched and verified on canvas.

## Verification Status
| Area | Status | Evidence |
|---|---|---|
| 360° Physical Capture | PASS | Owner physical smoke test confirmed (protected) |
| Preview Captured Output Display | PASS | Owner physical smoke test confirmed (protected) |
| Preview Deployed Parity (869adbad) | PASS | `/api/build-info` returns exact commit SHA |
| Real Deployed Pipeline (isTest: false) | PASS | 3 frames uploaded (200), finalize (200), job (202 -> READY 200) |
| Strict WebGL RGB Render (Excl. Alpha) | PASS | Step 7: 100/100 RGB (51,9,15), Official: 100/100 RGB (47,8,13) |
| Natural Wizard Progression | PASS | Steps 7->8->9->10->11->12->Live Booth, studio unhidden |
| Responsive Bounds (801x344 Landscape) | PASS | CDP verified: 538x290px (<= 801x344), rotate prompt hidden |
| Controls Reachability & Gestures | PASS | Landscape button gesture, drag/pan, pinch/zoom dispatched |
| Screenshots Published | PASS | `c12_3_p0_evidence/` (3 PNGs + JSON report) |
| Unit Tests (4/4) | PASS | `test/run_round123_viewer_handoff_tests.js` |
| Regression Tests (13/13) | PASS | `test/run_round122_closure_verification.js` |
| End-to-End CDP Smoke (7/7) | PASS | `test/run_round123_cdp_smoke_check.js` |

## Critical Files
- `virtual-tradeshow-commercial-v1/client/index.html` (and canonical 7 synchronized copies)
- `virtual-tradeshow-commercial-v1/server/index.js` (and canonical 3 synchronized copies)
- `test/run_round123_cdp_smoke_check.js`
- `scripts/patch_round123_viewer_bounds_and_handoff.js`
- `virtual-tradeshow-commercial-v1/production_artifacts/c12_3_p0_evidence/`

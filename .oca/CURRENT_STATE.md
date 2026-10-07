# CURRENT STATE

## Identity
- Protocol: OCA-DEV-1.3
- Project: goodkie/v-show:issue4
- Project Name: 3D2 Panorama Fast Track
- Workspace: c:\Users\server4\ai\v-show-stage2-fast-track
- Authority: https://github.com/goodkie/v-show/issues/4
- Branch: fix/panorama-capture-rotation-repair-round119
- State Rev: 1791359600

## Current Gate
- Phase: Round 123 Output Viewer Handoff & Mobile Landscape Default
- Gate: VIEWER ACCEPTANCE: FAIL / RELEASE: HOLD
- Owner Smoke Results:
  - 360° capture: PASS
  - Preview displays captured output: PASS
  - Preview landscape default: FAIL
  - Official viewer output: FAIL
- Last accepted audit/gate: ChatGPT Gate decision `issuecomment-6033528966`
- Remote head: `5148fb347db1d3246ebcfd5dc8ea81da0d5926ec`
- Rollback anchor: `restore/round123-p0-baseline-20261005` at `4181d146c82302e1a3ad49d793836371ff8217bb`

## Active Blockers
1. Official viewer (`#viewer-container`) does not display the captured result after wizard completes / closes.
2. Preview viewer does not default to landscape on mobile (a CSS 16:9 ratio and optional button was insufficient; requires active fullscreen + orientation lock on viewer open gesture, with prominent rotate prompt fallback).
3. Preview deployment on Railway must be verified via `/api/build-info` to reflect the exact deployed commit SHA.

## Next Required Actions
1. **Official Viewer Output Handoff Repair**:
   - Trace when the wizard finishes (Step 12 or modal close) and `mountActivePanoramicBoothViewer` / `activeSpatialBoothRenderer` is invoked.
   - Ensure the generated panorama asset URL is correctly persisted into `window.activeProjectData.panoramaVersions` and `activeBg.stitchedPanoramaUrl`, and that the renderer actually loads, decodes, and renders it onto `#viewer-container canvas`.
2. **True Mobile Landscape Default**:
   - In Step 7 and Step 11 (Preview viewer), and in `#viewer-container` (Official viewer):
   - Hook into the actual user action that opens the viewer (e.g. "Generate Tour", "Next Step" entering Step 7/11, or closing wizard to enter official viewer).
   - In that user gesture handler, immediately invoke `requestFullscreen()` and `screen.orientation.lock('landscape')`.
   - If orientation lock fails or is unsupported (common on iOS Safari or unpermissioned browsers), show a prominent mobile rotation banner overlay with a large click-to-rotate/fullscreen action.
3. **Automated Runtime CDP Test**:
   - In real Chrome CDP with mobile viewport emulation (344x801), simulate full fixture capture -> finalize-capture API -> panorama job -> Step 7 preview render -> finish wizard -> official viewer render.
   - Assert non-zero rendered pixels on the WebGL canvas in `#viewer-container`.
4. **Deploy & Build-Info Parity**:
   - Deploy to Preview, verify `/api/build-info` matches remote HEAD SHA.
5. **Report Formal Receipt**:
   - Post `[ANTIGRAVITY][RECEIPT][3D2 PANORAMA FAST TRACK][ROUND123-VIEWER-REPAIR]` to Issue #4.

## Verification Status
| Area | Status | Evidence |
|---|---|---|
| 360° Physical Capture | PASS | Owner physical smoke test confirmed |
| Preview Captured Output Display | PASS | Owner physical smoke test confirmed |
| Preview Mobile Landscape Default | FAIL | Owner physical smoke test failed -> remediation required |
| Official Viewer Output Handoff | FAIL | Owner physical smoke test failed -> remediation required |
| Unit Tests (4/4) | PASS | `test/run_round123_viewer_handoff_tests.js` |
| Regression Tests (13/13) | PASS | `test/run_round122_closure_verification.js` |
| Owner Smoke | NOT REQUESTED | Release on HOLD until engineering remediation proven |

## Critical Files
- `virtual-tradeshow-commercial-v1/client/index.html` (and canonical 5 synchronized copies)
- `test/run_round123_cdp_smoke_check.js`
- `test/run_browser_export_smoke_check.js`

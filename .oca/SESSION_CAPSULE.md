# OCA SESSION CAPSULE

PROTOCOL: OCA-DEV-1.3
PROJECT_ID: goodkie/v-show:issue4
PROJECT_NAME: 3D2 Panorama Fast Track
WORKSPACE_ROOT: c:\Users\server4\ai\v-show-stage2-fast-track
AUTHORITY_SOURCE: https://github.com/goodkie/v-show/issues/4
ACTIVE_BRANCH: fix/panorama-capture-rotation-repair-round119
STATE_REV: 1791359600
AUTHORITY_CURSOR: 6033528966
LAST_ACCEPTED_GATE: VIEWER ACCEPTANCE: FAIL / RELEASE: HOLD (360 capture: PASS, Preview display: PASS, Preview landscape: FAIL, Official viewer: FAIL)
REMOTE_HEAD: 9ac6f60baa9f2c42ed249594d67ec8a59a81babf
ROLLBACK_ANCHOR: restore/round123-p0-baseline-20261005 at 4181d146c82302e1a3ad49d793836371ff8217bb
NEXT_ACTION: 1) Repair official viewer output handoff using real upload/job/result path; 2) Enforce true mobile landscape default (auto-attempt fullscreen/landscape lock on viewer open gesture + prominent rotate prompt); 3) Prove actual decoded/rendered canvas pixels via CDP; 4) Deploy verified SHA to Preview.
BLOCKERS: Official viewer output handoff failing in real mobile runtime; mobile landscape default failing without explicit fullscreen/lock on viewer open.
OWNER_ACTION: NONE (No Owner recapture needed; capture pipeline passed)
RUNTIME_TARGET: Mobile Chrome (S23 Ultra profile: 344x801 portrait, 801x344 landscape) & Desktop Chrome
EVIDENCE_REF: test/run_round123_cdp_smoke_check.js, test/run_browser_export_smoke_check.js

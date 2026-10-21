# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Sprint Kickoff & Directives #6310936412, #6310977110, #6311032329, #6311090907, #6311119988, #6311145870)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-21.74
- Authority Cursor: 6311763870
- Last Directive / Audit: `[CHATGPT][EXECUTE-NOW][extension-form-sender][FINALIZATION-SPRINT-KICKOFF] Comment #6311145870`
- Last Receipt: `[ANTIGRAVITY][RECEIPT][extension-form-sender][RC3.34-FINALIZATION-SPRINT-COMPLETE]`
- Build ID: `R6.9G.10.3.7.1.4.48-20261021-FINAL-SPRINT-RC3.34`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.34.7.1.4.48`
- Functional Snapshot Head Commit (F): `df7743cacf0d66af8b2b52704d161f9210b4c780` (`df7743ca`)
- Provenance Commit (P): `499bc451b6814c810bc8767756f14a09a56c072c` (`499bc451`)
- Rollback Anchor: `15ef47920555e4d0a506d007329d265dc78825c4` (RC3.33)
- Previous Functional Restore Point: `15ef47920555e4d0a506d007329d265dc78825c4` (RC3.33)
- Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.48_PRIVATE_EGRESS_RC3.34.zip`
- Release Asset Size: `45,386,538` bytes
- Release Asset SHA-256: `1e9fe907733c08a10d85695a5704dc1e97adc19ad3864979efdf6bca88b77136`
- Release Asset Hosted URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.34.7.1.4.48`
- Unpacked Convenience Folder: `XPIDER_R6.9G.10.3.7.1.4.48_PRIVATE_EGRESS_RC3.34`

## Sprint Finalization Gate: [RC3.34-FINALIZATION-SPRINT-COMPLETE]

### Track A: Privacy & Egress Recovery (P0-A to P0-F) — 100% PASS
1. **In-Place Egress Repair (`repairExistingEgress`)**:
   - Audits `.private_egress_transaction.json`, queries droplet `610408684` on DigitalOcean API.
   - Discovers current Owner public IP (`159.26.98.240`) and updates Cloud Firewall `07f9921c-a925-4185-bdfb-366d22e8fb7d` inbound rules for port 8443.
   - Removes obsolete/insecure port 22 firewall rule.
   - Tests genuine TLS ClientHello handshake canary against `159.203.28.198:8443`.
   - Reboots droplet if proxy daemon stalls; fails gracefully with `REMOTE_PROVIDER_AUTH_REQUIRED` if token expired.
2. **Relay Single-Instance Mutex (`.relay.lock`)**:
   - Implemented strict heartbeat lockfile in `companion/privacy-relay-service.js`.
   - Eliminates duplicate node background spawns, port contention, and `EADDRINUSE` errors on startup.
3. **Tunnel Watchdog & Socket Timeouts**:
   - Injected 15s connect and 60s idle socket timeouts in `private-egress/proxy-service.js`.
   - Background watchdog pings TLS endpoint every 60s to prevent stale connection hang.
4. **UI In-Place Repair Trigger**:
   - Added Repair Egress button in popup HUD and guided wizard.
   - Prompts for DigitalOcean API token if credentials missing or expired.
5. **Executable Verification Suite**:
   - `test_sprint_track_a_egress_repair.js`: 5/5 PASS (Missing transaction, simulateProviderAuthRequired, simulateRecreateRequired, mock repair success, simulated timeout).

### Track B: CAPTCHA & Core Runtime Hardening (F1-F4, C1-C8) — 100% PASS
1. **F1 / C1 — Active Target Validation on Exception**:
   - `validateActiveExecution(msg.symbol, msg.epoch, msg.attemptId)` strictly verified upon `CAPTCHA_RUNTIME_EXCEPTION`.
   - Stale target exceptions are ignored; active target exceptions immediately settle the active execution without hang.
2. **F2 / C2 — Circuit Breaker Error Classification**:
   - Auto-pause circuit breaker classifies `CAPTCHA_RUNTIME_EXCEPTION` as `CORE_CODE` with symbol tracking.
   - Site-specific rejections (`CAPTCHA_TOKEN_REJECTED_BY_SITE`) correctly preserved as `SITE_SPECIFIC`.
3. **F3 / F4 / C7 — Post-Submit Polling Priority**:
   - Post-submit verification loop in `content-script.js` evaluates attempt-scoped CAPTCHA rejection DOM evidence *before* generic transport failures.
   - Prevents misattributing site-level token rejections as transient connection errors.
4. **C8 — Delta-Gated CAPTCHA Widget Error States**:
   - `capturePreSubmitSnapshot()` records pre-existing widget errors before submission.
   - Only newly emerged error flags/classes are classified as post-submit failures.
5. **Executable Verification Suite**:
   - `test_sprint_f1_f4_captcha_and_circuit_breaker.js`: 4/4 PASS.

### Track C: Exhaustive Automated Test Gate (Layers A–H) — 20/20 PASS
Executed complete machine manifest (`test_manifest.json`):
- **Layer A (Static Integrity & Syntax)**: 4/4 suites PASS
- **Layer B (Unit Logic & Classification)**: 3/3 suites PASS
- **Layer C (Gateway & Provisioner Hardening)**: 3/3 suites PASS
- **Layer D (Attempt Reset & Exception Containment)**: 2/2 suites PASS
- **Layer E (Integration & Idempotency)**: 2/2 suites PASS
- **Layer F (Host Invariants & WinSec)**: 2/2 suites PASS
- **Layer G (Multi-Frame & Behavioral Acceptance)**: 3/3 suites PASS
- **Layer H (Browser E2E Rehearsal)**: 1/1 suite PASS (8/8 tests)
**Overall Gate: 20/20 Test Suites Passed in 9.97s (100% Green).**

### Track D: Controlled Browser E2E Rehearsal — 8/8 PASS
Executed `run_edge_sprint_controlled_e2e_rehearsal.js` in headless Microsoft Edge via CDP:
1. Local HTTP fixture server started on port 8088.
2. Edge browser spawned with loaded extension; CDP connection established.
3. Service Worker inspected; `BuildProvenance` matches expected sprint build ID.
4. `contact-standard.html` loaded; form discovery verified.
5. Autofill mapping completed; visual confirmation flags respected.
6. Physical submit button triggered; successful outcome settled.
7. Cloudflare Turnstile test page (`cf-turnstile-visible-pass.html`) loaded; widget detected.
8. Clean teardown of Edge browser and fixture server.

### Track E: Single Final Candidate Release (RC3.34) — COMPLETE
- **Functional Snapshot Commit (F)**: `df7743cacf0d66af8b2b52704d161f9210b4c780`
- **Provenance Stamping Commit (P)**: `499bc451b6814c810bc8767756f14a09a56c072c`
- **Parity Verification**: 100% SHA256 match across all 26 components in `extension/`, `send_message_backup/`, and `send_message_backup/build/extension/`.
- **Release Artifact**: `XPIDER_R6.9G.10.3.7.1.4.48_PRIVATE_EGRESS_RC3.34.zip` (45,386,538 bytes, SHA256: `1e9fe907733c08a10d85695a5704dc1e97adc19ad3864979efdf6bca88b77136`).
- **Unpacked Directory**: `XPIDER_R6.9G.10.3.7.1.4.48_PRIVATE_EGRESS_RC3.34/` (all JS files syntax verified clean via `node --check`).

### Invariants & Operating Guidelines:
1. **Existing Droplet Preservation**: Droplet `610408684` (`159.203.28.198`) in TOR1 preserved intact.
2. **Fail-Closed Privacy Barrier**: Zero direct ISP leaks; fail-closed relay enforced.
3. **Packaging Hygiene**: Zero runtime artifacts, zero plaintext secrets, zero OS mutations.
4. **Zero Intermediate Owner Labor**: Fully automated verification before live smoke test.

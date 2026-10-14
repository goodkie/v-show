# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Comment #6159120580)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-14.01
- Last Directive: Owner Directive Comment #6159120580 (`[R6.9G.10.3.7.1.4.5 — ONE-CLICK AUTO SETUP + ALWAYS-VISIBLE SETTINGS]`)
- Last Receipt: #6160443452 (`https://github.com/goodkie/v-show/issues/6#issuecomment-6160443452`)
- Current Release Tag: `v6.9g.10.3-audit.7.1.4.5`

## Current Gate
- Formal Gate: R6.9G.10.3.7.1.4.5 ONE-CLICK AUTO SETUP + ALWAYS-VISIBLE SETTINGS COMPLETE.
- Engineering Acceptance Status: **PASS (PRESERVED)** (Independently audited & accepted by ChatGPT in Gate Comment #6116362094).
- Pre-Hardware Real Software Acceptance: **AVAILABLE-SCOPE SOFTWARE PASS (#6134283065)**.
- Owner Functional Test Mode & UX Hardening: **100% PASS ACROSS ALL DIRECTIVE REQUIREMENTS**.
  - **Always-Visible Settings Control & Top Navigation Toolbar**:
    - Converted `#settings-toggle` and `#reset-all-lists-btn` into a fixed/sticky `.top-nav-bar` positioned at `top: 0`.
    - Eliminated horizontal clipping at narrow widths (>= 320px).
    - Minimum 36×36 hit target verified; responsive regression passed across 320px, 360px, and 400px side panel viewports.
    - Verified clickability and settings overlay toggle in real Microsoft Edge browser.
  - **One-Click "✨ AUTO SETUP" & Reversible Restore Point**:
    - Detects `BuildProvenance` `TEST_ONLY`.
    - Atomically snapshots existing public list (e.g. 100 URLs) and settings into reversible restore point (`xpider_owner_backup_snapshot`).
    - Loads verified 7 local fixtures (`http://127.0.0.1:8088/*`).
    - Enables `ownerFunctionTestMode` and installs DNR guard rules 990001–990005 fail-closed.
    - Configures Level 6 test defaults (10s collect, 300ms fill, 4.0s hold), disables skip/double-submit, auto-saves settings.
    - Exposes `🚀 RUN FUNCTION TEST` and `↩ RESTORE PREVIOUS SETTINGS/LIST`.
    - Tested end-to-end: Snapshot 100 public URLs -> Auto Setup -> Reversible Restore -> Re-arm verified.
  - **Public Targets Guard**:
    - When Owner Test Mode is active, queue checks strictly block attempts to start campaigns with non-loopback URLs before navigation.
    - Actionable alert guides user to either click `✨ AUTO SETUP` or `↩ RESTORE`.
  - **Settings UI Simplification**:
    - Simplified Settings overlay into Basic view by default (Auto Setup, CAPTCHA, Privacy status, Test Mode toggle, Save button).
    - Collapsed advanced routing, diagnostics, and network configuration into `<details id="advanced-settings-disclosure">` while preserving 100% of element IDs and handlers.
  - **One-Click Windows Helper**:
    - Packaged `XPIDER_AUTO_SETUP.bat` in root and diagnostic zip for 1-click companion native host registration and silent relay startup.
  - **Negative Paths 1–5 & 2 Lifecycle Regressions**:
    - All 5 negative paths strictly blocked in real Microsoft Edge.
    - Pause/Resume and SW restart boot reconciliation verified intact.
  - **Positive Path**: Full 7-target campaign executed with exact expected outcome (4 SUCCESS, 2 SKIPPED, 1 FAILURE).
  - **Secret Hygiene**: Zero secrets or credentials leaked across 337 files.
- Rollback Anchor: `dc0740a0c69e2f7fa96b6989841acf0831b3619e` (immutable baseline rollback anchor).
- Next Action: Receipt #6160443452 posted to Issue #6. Await ChatGPT Final Gate / Owner Functional Verification.

## Lineage & Remote Git SHAs
- `ROLLBACK_ANCHOR`: `dc0740a0c69e2f7fa96b6989841acf0831b3619e` (immutable baseline anchor)
- Previous Head: `e93aaff3a9eb16b2fd26c78345fa70b6c2ae8e7b`
- Functional Commit SHA: `87b76e7a83556554be5fb7dcaef568903c7344fb` (`87b76e7a`)
- Provenance Commit SHA: `3746cee276ca9b78f44ff5a772da3cf635031b46` (`3746cee2`)
- Direct Commit Lineage: `3746cee2` is the direct child of `87b76e7a`
- Release Tag: `v6.9g.10.3-audit.7.1.4.5`

## Build Provenance
- Build ID: `R6.9G.10.3.7.1.4.5-20261014-ONE-CLICK-AUTO-SETUP-SETTINGS-VISIBLE`
- Functional HEAD: `87b76e7a83556554be5fb7dcaef568903c7344fb` (`87b76e7a`)
- Background SHA-256: `aed9065156f9fda2b46fb860331f67dd4e78015d7ec7028ff9c0a053fe769618`
- Popup SHA-256: `8934c9b65fb8aa81f550598bb9196fb94f8312c97606dd9598173dd1fd666588`
- Privacy Gateway SHA-256: `2662f12eb26290a8334e9de4727cd0ceb039d966c4ec05d2c321ede7715a43a9`
- Previous Functional Restore Point: `80fd5ee98940693f6401c534aee040e730325149`
- Manifest Version: 3
- Branch: `upgrade/phase-0-1`
- Built At: 2026-10-14T03:30:00.000Z
- Release Package Assets:
  - `XPIDER_R6.9G.10.3.7.1.4.5_OWNER_DIAGNOSTIC_TEST_ONLY.zip` (4,400,368 bytes, SHA-256: `70653c642731a6ad04173e00015bd06f3dffbb55506ce6b984da013a4d0e0f02`)

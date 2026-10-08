# XPIDER AutoForm Sender Pro — R6.9G.10.3.4 Migration-Safe Template Hydration + Start Template Recovery

### Authority & Governance
- **Issue**: goodkie/v-show Issue #6 (Addressing ChatGPT Directive [#6058000706](https://github.com/goodkie/v-show/issues/6#issuecomment-6058000706))
- **Branch**: `upgrade/phase-0-1`
- **Functional HEAD**: `4ef7def9689cdf4c508651e2f6bee6b320e7ab8e` (`4ef7def9`)
- **Provenance HEAD**: `5fd105e7c8e80faf328737d622543f96c3324fc5` (`5fd105e7`)
- **Immutable Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point**: `e5010f2d276e3c78796e80291a828e6ceda8d96d`
- **Previous Release (Rollback Reference)**: `v6.9g.10.3-audit.2` (R6.9G.10.3.3, preserved untouched)

### Release Package Assets & Verification Digests
1. **Unified Diagnostic Package (ZIP)**:
   - File: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - Size: 4,343,012 bytes
   - SHA-256: `230f71c18f9c441a6bd1bca3dc2c3dd414916d10ae3a0b9db05309286b925d02`
   - Contents:
     - `extension/`: Chrome/Edge MV3 Extension build with serialized migration bootstrap, idempotent template repair, start readiness guard, and auto-hydration
     - `companion/`: Windows Privacy Relay companion service (`install_companion.bat`, `uninstall_companion.bat`, `winsec.js`, etc.)
     - `PACKAGE_INVENTORY_SHA256.txt`: SHA-256 digest of every file in the package (exact match verified)

2. **Real Microsoft Edge Runtime Evidence Traces (LOG)**:
   - File: `evidence_r6_9g10_3_real_runtime_traces.log`
   - Size: 33,554 bytes
   - SHA-256: `c952383a17fb7cb37f2c9926f6d8f7c03a2675b4782969a07508a23d890755b4`

### Problem Solved & Implementation (Directive #6058000706)
1. **Root Cause Resolved**: In R6.9G.10.3.3, `hydrateSettings()` ran concurrently with an independent fire-and-forget `EXECUTE_MIGRATION` event listener during boot, reading storage before `templates_v2` was populated. Additionally, `TemplateStore.migrateLegacyData()` used `if (tplLibrary) ... else if (xpider_tpl)` which ignored valid messages in `xpider_tpl` when empty `tplLibrary` entries existed, and already-promoted schema v2 instances returned `ALREADY_V2` without repairing empty canonical defaults.
2. **Serialized Startup Migration**: Integrated `await ensureSchemaReady()` directly into the primary boot pipeline before `hydrateSettings()`, guaranteeing storage promotion completes prior to DOM population.
3. **Multi-Source Legacy Aggregation**: Evaluates `tplLibrary`, `xpider_tpl`, and `xpider_recent_templates`, selecting non-empty messages as the canonical default.
4. **Idempotent Backup-Safe Repair Path**: If `currentVersion >= 2` but the canonical default template has an empty message body, `TemplateStore` inspects `xpider_tpl`, the latest `xpider_backup_v1_*` payload, and alternative templates, safely restoring the non-empty message into the canonical default template without altering existing backups or deleting user data (`[TEMPLATE_REPAIR] repaired=true`).
5. **Start-Time Readiness Guard**: Added `ensureTemplateReadyForStart()` before start message validation with dirty-state tracking (`isMessageDirty`, `isTemplateDirty`).
6. **Diagnostics & Safe UI Fallback**: Added `[TEMPLATE_MIGRATION]`, `[TEMPLATE_HYDRATE]`, `[TEMPLATE_START_GUARD]`, `[TEMPLATE_REPAIR]` without logging sensitive content. Switched to template tab with highlighted input on true empty message.

### Verification & Acceptance (100% PASS)
- **Unit Regression Suite** (`test_r6_9g10_3_4_template_hydration.js`): 6/6 PASS (Tests A through F).
- **Real Microsoft Edge Operator Audit** (`run_real_r6_9g10_3_edge_operator_audit.js`): 100% PASS on Gates A - J.
- **Gate G (Real Edge Owner Trace Reproduction)**:
  - Exact extracted delivered release bundle loaded into real Microsoft Edge.
  - Legacy `xpider_tpl` seeded into storage.
  - Real Edge popup opened; verified `[TEMPLATE_HYDRATE]` logged with `messagePresent=true` and `#tpl-message` automatically populated (`msgLen: 62`).
  - 3 controlled target URLs loaded via UI without manually typing Message Body.
  - Real Edge DOM `#start-btn.click()` executed.
  - Complete ordered diagnostic trace verified:
    `[TEMPLATE_HYDRATE]` -> `[START_UI] click (queue=3, msgPresent=true)` -> `[START_GUARD] queue=3 messagePresent=true` -> `[START_IPC]` -> `[START_BG]` -> `[START_ACK]` -> Target dispatch (`/contact-target?q=1`) -> Autofill started.

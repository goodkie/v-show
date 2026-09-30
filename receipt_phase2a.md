## [ANTIGRAVITY][RECEIPT][extension-form-sender][PHASE 2A + SOURCE EVIDENCE]

**Date:** 2026-09-30  
**Source Root:** `E:\vivpr\ai\extension-form-sender` (Local Git Repository, no remote)  
**Collaboration Hub:** `goodkie/v-show` (Issue #6)  
**Baseline SHA:** `644d2e8463002588f7394bce5feaf592a2b2e4af`  
**Phase 2A Start SHA:** `43b89254d03dce1f451bf7c5c85848617e51d369`  
**Phase 2A End SHA:** `6e1b7af332b6a3ab52e286065299ef469443e2fd`  
**Branch:** `upgrade/phase-0-1`  
**Agent:** Antigravity

---

### 1. Exact Changed Files

1. `send_message_backup/modules/template-store.js` (NEW: FormTemplateV2 CRUD, default selection, backup & idempotent migration engine)
2. `send_message_backup/modules/history-store.js` (NEW: ImportRow/Target/Attempt/ResetEvent logical separation, durable suppression, tenant identity preservation, spreadsheet-safe CSV export)
3. `send_message_backup/background.js` (Single Writer RPC handlers for migration, row ingestion, suppression checks, and reset guards)
4. `send_message_backup/build/extension/modules/*` (Authoritative mirror sync for all new modules)
5. `send_message_backup/build/extension/background.js` (Authoritative mirror sync for service worker)
6. `test_phase2a.js` (NEW: Automated acceptance test suite for all 12 ChatGPT Phase 2A requirements)

---

### 2. Core Implementation Deliverables

#### 1) P2A-1: Single Writer Migration & Resumable Commit Protocol
- **Single Authority:** Background Service Worker is the exclusive writer for schema migration and reset events. Side Panel communicates via `EXECUTE_MIGRATION` RPC without direct uncontrolled storage mutation.
- **Atomic Flow:**
  1. `xpider_backup_v1_{timestamp}` created before mutating active keys.
  2. Legacy `tplLibrary` and `savedUrlLists` transformed and verified against schema.
  3. `xpider_schema_version = 2` committed only upon successful verification.
  4. Idempotency verified: re-running on v2 state returns `{ migrated: false, reason: "ALREADY_V2" }`.

#### 2) P2A-2: Distinct Records (ImportRow vs Target vs Attempt)
- **ImportRow:** Preserves every raw row (`rowId`, `sourceRowId`, `importId`, `rawInputUrl`, `targetIdentity`, `status`, `attemptId`). Multiple rows pointing to the same website are 100% preserved in reporting.
- **Target:** Persistent cross-import identity (`targetIdentity`, `isSuppressed`, `effectiveGeneration`, `lastAttemptId`).
- **Attempt:** Tracks actual execution attempts (`attemptId`, `sessionId`, `templateId`, `templateVersion`, `status`, `reasonCode`, `timing`, `evidence`). Skipped or invalid rows do **NOT** fabricate fake submit attempts.

#### 3) P2A-3: Durable Suppression & Intentional Resend
- **Suppression:** Applies to both `CONFIRMED_SUCCESS` and `DELIVERY_UNKNOWN`. Changing templates does not release prior success suppression.
- **Selective Reset:** Advances `effectiveGeneration` only for chosen targets. Unselected targets remain suppressed.
- **Global Reset:** Advances global `currentGeneration`, preserving all historic audit rows.
- **Submit Lock Guard:** Reset requests are strictly rejected if an active submit lock (`SUBMIT_PENDING`) is in flight.

#### 4) P2A-4: Tenant & Identity Normalization
- Preserves hosted tenant path context (e.g. `platform.com/user1/contact` vs `platform.com/user2/contact`).
- Strips only marketing parameters (`utm_*`, `ref`, `fbclid`), preserving meaningful queries and exact raw URLs.

#### 5) P2A-5: RFC-4180 & Spreadsheet-Safe CSV Export
- Compliant CSV output with quotes, commas, multiline, and Korean/Unicode support.
- **Formula Injection Defense:** Cells starting with `=, +, -, @, \t, \r` are automatically prefixed with a single quote (`'`) to protect spreadsheet consumers.

---

### 3. Acceptance Test Evidence (12/12 PASS)

**Command:** `node test_phase2a.js`
```text
=== [PHASE 2A ACCEPTANCE TEST RUNNER] Starting 12 Test Cases ===
✅ PASS Test 1: Repeated legacy migration is strictly idempotent
✅ PASS Test 2: Concurrent migration requests serialized by single writer
✅ PASS Test 3: Unfinished/failed migration leaves legacy data intact and recoverable
✅ PASS Test 4: Name splits, custom fields, default selection, and savedUrlLists survive migration
✅ PASS Test 5: Three imported rows link to single target with all 3 preserved in report
✅ PASS Test 6: Invalid/skipped row produces zero fabricated submit attempts
✅ PASS Test 7: Suppression for CONFIRMED_SUCCESS and DELIVERY_UNKNOWN survives re-import and restart
✅ PASS Test 8: Failures remain retryable while template changes cannot bypass success suppression
✅ PASS Test 9: Selective reset releases only chosen targets while preserving unselected suppression
✅ PASS Test 10: Selective reset followed by global reset maintains consistent generation progression
✅ PASS Test 11: Reset correctly guarded and rejected when active submit lock exists
✅ PASS Test 12: RFC-4180 and Spreadsheet formula injection escape validated
=== ALL 12 PHASE 2A ACCEPTANCE TESTS PASSED (100%) ===
```

**Full Regression Status:**
- `node test_phase0_1.js` -> **100% PASS**
- `node test_phase0_1_behavioral.js` -> **100% PASS**
- `node -c background.js` -> 0 syntax errors
- Parity between `send_message_backup/` and `build/extension/` verified (100% identical).

**Phase 2A Status:** COMPLETE & VERIFIED.

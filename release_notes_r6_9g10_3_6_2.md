# XPIDER AutoForm Sender Pro — R6.9G.10.3.6.2 Privacy Relay Settings Operationalization + One-Click Node Verify Package

### Authority & Governance
- **Issue**: goodkie/v-show Issue #6 (Addressing ChatGPT Directive Comment #6095992773)
- **Branch**: `upgrade/phase-0-1`
- **Functional HEAD**: `32e384d1f7ac0292308011f60bd6c1ef2bb86654` (`32e384d1`)
- **Provenance HEAD**: `67bbbd7dd34a7da840684ebc6337deda6a0e92b9` (`67bbbd7d`)
- **Build ID**: `R6.9G.10.3.6.2-20261010-PRIVACY-RELAY-SETTINGS-OPERATIONALIZATION`
- **Immutable Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point**: `65c3fd81087216b71e825fd6641c2404016b9e61` (`65c3fd81`)
- **Release Tag Lineage**: Directly bound to commit `67bbbd7d` on `upgrade/phase-0-1`.

### Release Package Assets & Verification Digests
1. **Unified Diagnostic Package (ZIP)**:
   - File: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - Size: 4,351,712 bytes
   - SHA-256: `7bbd1954255e249d23ba9cc8f5e01b43308dcb925d0e44f5f5ead96dfcca8119`
   - Contents:
     - `extension/`: Chrome/Edge MV3 Extension build
     - `companion/`: Windows Privacy Relay companion service (`install_companion.bat`, `uninstall_companion.bat`, `privacy-relay-service.js`, etc.)
     - `PACKAGE_INVENTORY_SHA256.txt`: SHA-256 digest of every file in the package (exact match verified)

2. **Real Microsoft Edge Runtime Evidence Traces (LOG)**:
   - File: `evidence_r6_9g10_3_6_2_real_runtime_traces.log`
   - Size: 7,375 bytes
   - SHA-256: `d10615beaf13c21efaf07a0284f108a0b75ab6fc62ec1d0401b627fddf2ef66e`

### Real Microsoft Edge Operator Audit Verification (Scenarios 1 - 10: 100% PASS)
- **Scenario 1**: Initial state truthfulness in real Edge popup: initial badge `ONLINE / NO NODES`, active node `—` (zero hardcoded `egress-node-1`), fingerprint `Offline` (zero indefinite `Loading...`), rotate button disabled — **PASS**
- **Scenario 2**: Protocol boundary enforcement: `SOCKS5` option completely removed from Privacy Relay node type selector (forward proxy upstream supports `HTTP_PROXY` and `HTTPS_PROXY` only; SOCKS5 reserved for Direct Managed Proxy mode) — **PASS**
- **Scenario 3**: Mode allowlist server-side enforcement: Companion `/mode` rejects invalid strings with HTTP 400 (`INVALID_ROTATION_MODE`), authoritatively accepts allowlist modes `FIXED`, `MANUAL`, `CAMPAIGN_BOUNDARY`, `HEALTH_FAILOVER` with HTTP 200 — **PASS**
- **Scenario 4**: Bounded local recovery polling: "Start / Repair" button dispatches native startup, transitions UI through `⚡ Starting...` and `STARTING...`, conducts bounded polling (1s ticks, 8s ceiling), restores button to `⚡ Start / Repair` upon online status — **PASS**
- **Scenario 5**: 1-Click node onboarding flow: input validation (empty host, invalid port rejected), saves node to pool via DPAPI encryption, automatically triggers `SELECT_PRIVACY_RELAY_EGRESS` canary probe, verifies upstream egress, activates node, derives fingerprint, updates badge to `ONLINE / READY`, clears inputs — **PASS**
- **Scenario 6**: Fail-closed invariant: `failClosed=true` cannot be bypassed; dropped mock proxy terminates continuity check fail-closed (`PRIVACY_RELAY_NOT_READY`); direct internet fallback strictly blocked — **PASS**
- **Scenario 7**: Credential safety: passwords encrypted via Windows DPAPI before disk persistence; zero plaintext password stored in `egress_pool_config.json`; zero plaintext rendered in popup DOM; displays secure `🔒 AUTH` indicator badge — **PASS**
- **Scenario 8**: Egress node list presentation: displays Name/ID, type, host:port, health badge (`[HEALTHY]`), credential badge, `● ACTIVE` indicator, Delete action; special characters HTML-entity escaped — **PASS**
- **Scenario 9**: Node deletion & empty pool clearance: removing nodes via UI clears pool to 0, authoritatively resets active node to `—`, resets fingerprint to `Offline`, updates badge to `ONLINE / NO NODES`, displays clean empty state message — **PASS**
- **Scenario 10**: Multi-node rotation & live probe: adding multiple nodes and triggering `🔄 Rotate Egress Now` rotates active node from Node 1 to Node 2, derives fresh sha256 fingerprint, and updates UI without session drops — **PASS**

### Operational Invariants
- Strict fail-closed privacy is maintained (`failClosed` is never disabled automatically).
- Direct internet fallback is strictly blocked.
- Single-authority background privacy prep invariant intact.
- Bulk campaign remains strictly on **HOLD**.

# XPIDER AutoForm Sender Pro — Release Notes R6.9G.10.3.7.1.4
## IMMUTABLE SAME-EGRESS ENROLLMENT SEAL

Release Tag: `v6.9g.10.3-audit.7.1.4`  
Authority: goodkie/v-show Issue #6 (Addressing ChatGPT Audit Comment #6103744414)  
Branch: `upgrade/phase-0-1`  
State Revision: `2026-10-11.23`  

---

### 1. Build & Lineage Provenance
- **Build ID**: `R6.9G.10.3.7.1.4-20261011-IMMUTABLE-SAME-EGRESS-SEAL`
- **Functional HEAD**: `c4a97e39509e5e791620a42e676782a82259f472` (`c4a97e39`)
- **Provenance Seal HEAD**: `7e7e50e5eb384be8bf9934fc9b4e3f8981f42d2a` (`7e7e50e5`)
- **Direct Child Lineage**: `7e7e50e5` is the direct child of `c4a97e39` (`HEAD~1 === c4a97e39`)
- **Previous Functional Restore Point**: `2e049a7b529c47523d6cd9c1cea79d1d92e15d1c` (`2e049a7b`)
- **Immutable Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Manifest Version**: 3

---

### 2. Cryptographic Release Assets
1. **Diagnostic Release Package (ZIP)**:
   - **Filename**: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - **Exact Size**: `4,384,004` bytes
   - **SHA-256**: `a717142df3609f581cee37c7aee1a7f53529b8eec4b1d0cb9984e96952da6961`
   - **Sanitization**: Shipped companion package strictly excludes all tests, mocks, test certs, and node_modules. Zero `mockRouteTable` or `mock_routes` in production code.

2. **Real Microsoft Edge Runtime Evidence Log**:
   - **Filename**: `evidence_r6_9g10_3_7_1_4_real_runtime_traces.log`
   - **Exact Size**: `12,574` bytes
   - **SHA-256**: `f26ab8817760e113470bab150484fd1b863b4a28f53a4fdf6e3d010e5d1df8e2`

---

### 3. Key Enhancements & Remediation

1. **Immutable Same-Egress Enrollment Seal (Addressing Final Audit Blocker #6103744414)**:
   - **Rule A (Trust Anchor Creation)**: The first enrolled egress node in a group establishes the global trust anchor (`pinnedEgressFingerprint`, `pinnedEgressIdentityGroup`).
   - **Rule B & Final Blocker (Conflicting Fingerprint Rejection)**: When an additional node is enrolled with a conflicting fingerprint, `/enroll-egress` fails closed with **HTTP 409 (`EGRESS_PIN_MISMATCH`)**. The global pin remains immutable, existing node state is untouched, and the conflicting node is not trusted.
   - **Rule B (Identity Group Mismatch Rejection)**: Attempting to enroll a node with a different `egressIdentityGroup` while a trust anchor exists returns **HTTP 409 (`EGRESS_IDENTITY_GROUP_MISMATCH`)** without mutating the global group anchor.
   - **Rule C (Primary WG Anchor Requirement)**: Enrolling a fallback `OPAL_OVPN` node requires an established primary `OPAL_WG` anchor within that identity group; premature fallback enrollment fails with **HTTP 400 (`PRIMARY_WG_ANCHOR_REQUIRED`)**.
   - **Rule E (Explicit Destructive Reset)**: Introduced `POST /physical-gate/reset-trust` (Authenticated) which pauses relay, clears global pins, un-verifies all nodes, and triggers fail-closed evaluation.

2. **Persistent Disk Anchor Parity**:
   - Fixed `saveConfig()` in `companion/privacy-relay-service.js` to explicitly preserve `pinnedEgressFingerprint` and `pinnedEgressIdentityGroup` inside `this.pool.physicalGate` across all disk saves.
   - Deep-copied `physicalGate` in `loadConfig()` to eliminate in-memory mutation of shared default objects.
   - Deterministic trust anchor restoration across Companion process restart: reads directly from persisted metadata, or restores from enrolled nodes if all nodes strictly agree (fails closed without guessing if nodes disagree).

3. **Real Microsoft Edge Operator Audit Suite**:
   - Executed 8 rigorous scenarios against extracted release bytes with real Microsoft Edge via CDP:
     - Scenario 1: Initial/Default state -> Physical Gate DISABLED -> legacy transport allowed.
     - Scenario 2: Enable Physical Gate -> Reads REAL Windows Get-NetRoute -> Detects non-Opal gateway -> immediate FAIL-CLOSED.
     - Scenario 3: Real HTTP request through Companion proxy (18988) -> 502 PHYSICAL_GATE_FAIL_CLOSED dropped.
     - Scenario 4: Public proxy anti-bypass rejection (RFC1918 check + Physical Gate mode).
     - Scenario 5: Router pairing via REAL OpenSSH fixture (ssh2.Server) with strict Ed25519 key verification + negative test.
     - Scenario 6: Immutable Same-Egress Enrollment Seal (Premature OVPN 400, Primary WG anchor, Matching OVPN 200, Conflict FP 409 + anchor preserved, Mismatch group 409 + group preserved, Reset trust 200).
     - Scenario 7: Real Production Relay 18988 Monitor Revocation & In-Flight Lock (16s wait, 0 target requests, 502 drop).
     - Scenario 8: Router script lifecycle (Dropbear + OpenSSH) & Windows Companion uninstallation.
   - All 8 scenarios PASSED 100%.

---

### 4. Status & Next Action
- Engineering Acceptance Status: **PASS**
- Owner Action: **HOLD** (Awaiting ChatGPT gate audit).
- Bulk Campaign: **HOLD**

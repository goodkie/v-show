# Release Notes: XPIDER AutoForm Sender Pro v6.9g.10.3-audit.7.1.2

**Release Tag**: `v6.9g.10.3-audit.7.1.2`  
**Build ID**: `R6.9G.10.3.7.1.2-20261010-CLEAN-ATTESTATION-REAL-SSH-SEALED`  
**Active Branch**: `upgrade/phase-0-1`  
**Functional Commit**: `24d689f6b97ea4a26b59079ecce2c023879a7731`  
**Provenance Seal Commit**: `8cb22567309d92c4af91f9cf3bd51e691cb58069`  
**Authority Reference**: ChatGPT Audit Directive `#6102076734` on `goodkie/v-show` Issue #6  

---

### Executive Summary

`v6.9g.10.3-audit.7.1.2` completely remediates all 10 architectural and integrity blockers identified in ChatGPT Audit Directive `#6102076734`:
1. **Clean Production Attestation**: Completely excised all references to `mock_routes.json` and environmental overrides from production Windows Network Attestation. Runtime strictly queries genuine Windows routing tables (`Get-NetRoute`).
2. **Production Anti-Bypass (Physical Gate)**: Removed `allowLoopbackProxy` from production persisted configuration and API schemas. Physical Gate unconditionally rejects `127.0.0.1` and `localhost` with `LOOPBACK_PROXY_FORBIDDEN_IN_PRODUCTION_PHYSICAL_GATE`.
3. **Canonical Forced Command OpenSSH Path**: Standardized on canonical `/usr/libexec/xpider-router-attest` across all router pairing generators, installers, and driver executions.
4. **Real OpenSSH Server Fixture (Blocker 8)**: Implemented end-to-end native OpenSSH execution (`ssh.exe`) against an in-process `ssh2.Server` fixture. Verifies native Ed25519 OpenSSH keypair generation via `ssh-keygen`, DPAPI-protected private key persistence, non-blocking asynchronous execution (`execFileAsync`), and immediate second SSH attestation.
5. **Mandatory Per-Node Physical Egress Fields (Blocker 6 & 7)**: Enforced mandatory `egressIdentityGroup` and `expectedEgressFingerprint` on every enrolled physical node.
6. **Strict Truthful Router Attestation Telemetry**: Fixed GL.iNet driver route parsing so absent route fields default strictly to `false` (`data.route && data.route.defaultGatewayViaOpal === true`).
7. **True Autonomous Background Monitor Revocation (Blocker 9)**: Proven that after a mid-run tunnel drop, the 15-second background monitor revokes `ready` status autonomously after 16 seconds *without* any manual re-verify API calls or UI interactions. Outbound requests immediately drop with `502 Bad Gateway` (0 requests reach target). Tested synchronous `isRevalidating` in-flight lock.
8. **Owner Package Cleansing**: Excluded all test scripts and test fixtures from the packaged companion archive.
9. **Clean Companion Uninstallation**: Proven extracted `uninstall_companion.bat --silent` halts daemon, cleans Windows Startup, and unregisters Native Messaging Hosts from registry.
10. **Cryptographic Release Artifacts**: Fully sealed and verified release package matching exact SHA-256 and byte size.

---

### Cryptographic Release Assets

| Asset Name | Size (Bytes) | SHA-256 Checksum |
| :--- | :--- | :--- |
| `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip` | `4,382,814` | `8d792add0d9174528669e9d365cb739bff35afd82afa29654f2b1909562d1154` |
| `evidence_r6_9g10_3_7_1_2_real_runtime_traces.log` | `9,758` | `af70c26f16d7b4cbe17b0985daad2436d98891cd00c338c833c5a4df0ba00307` |

---

### Verification Summary

- **Unit Test Suites**:
  - `test_r6_9g10_3_7_1_2_physical_gate.js`: **8 of 8 PASSED (100%)**
  - `test_r6_9g10_3_7_1_1_physical_gate.js`: **9 of 9 PASSED (100%)**
- **Real Microsoft Edge Operator Audit (`run_real_r6_9g10_3_7_1_2_edge_operator_audit.js`)**:
  - Scenario 1: Initial State -> Physical Gate Disabled: **PASS**
  - Scenario 2: Enable Physical Gate -> Fail-Closed (Real Windows Route): **PASS**
  - Scenario 3: Real Companion Proxy 502 Drop on Physical Gate Block: **PASS**
  - Scenario 4: Public Proxy Rejection in Physical Gate Mode: **PASS**
  - Scenario 5: Router Pairing via Real OpenSSH Fixture (Blocker 8): **PASS**
  - Scenario 6: Physical Egress Enrollment & Transport Binding: **PASS**
  - Scenario 7: Mid-Run READY -> Drift -> True Monitor Revocation (Blocker 9): **PASS**
  - Scenario 8: Clean Uninstall via extracted `uninstall_companion.bat --silent`: **PASS**

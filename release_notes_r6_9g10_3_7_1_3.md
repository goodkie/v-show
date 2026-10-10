# Release Notes — XPIDER AutoForm Sender Pro R6.9G.10.3.7.1.3

## Release Title
`v6.9g.10.3-audit.7.1.3` — R6.9G.10.3.7.1.3 FINAL PRODUCTION PATH SEAL + REAL RELAY MONITOR BLOCK

## Authority Context
- **Authority Directive**: ChatGPT Audit Comment `#6102776167` on `goodkie/v-show` Issue #6
- **Decision Baseline**: PROVISIONAL PASS / HOLD on `v6.9g.10.3-audit.7.1.2`
- **Active Branch**: `upgrade/phase-0-1`
- **Functional Commit**: `2e049a7b529c47523d6cd9c1cea79d1d92e15d1c` (`2e049a7b`)
- **Provenance Seal Commit**: `003a1dda5129f9412d998053fe44f186180f05d3` (`003a1dda`)
- **Lineage**: `003a1dda` is the direct child of `2e049a7b` (`HEAD~1 === 2e049a7b`)
- **Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Restore Point**: `24d689f6b97ea4a26b59079ecce2c023879a7731` (`24d689f6`)
- **Build ID**: `R6.9G.10.3.7.1.3-20261010-FINAL-SEAL-REAL-RELAY-MONITOR`
- **Owner Action**: Strictly NONE (HOLD). Do not disturb Owner.

---

## What's Changed in this Release

### 1. Blocker 3: Zero `mockRouteTable` in Production Windows Attestation
- Completely excised `this.mockRouteTable` property, options, and branches from production `companion/windows-network-attestation.js`.
- Production attestation strictly executes native Windows PowerShell route table cmdlets (`Get-NetRoute`).
- Clean Dependency Injection at the `PhysicalGate` boundary: test suites and audit fixtures inject unshipped `FakeWindowsNetworkAttestation` directly into `PhysicalGate({ windowsAttestation: fakeAttest })`.
- Absolute zero mock code, bypass flags, or test seams exist within the diagnostic release package.

### 2. Blocker 1 & 5: Consistent Router Authorized_Keys Lifecycle
- Standardized router installation (`install-opal-attestation.sh`), UI-generated pairing commands (`companion/router-attestation.js`), and uninstallation (`uninstall-opal-attestation.sh`) across both Dropbear (`/etc/dropbear/authorized_keys`) and OpenSSH (`/root/.ssh/authorized_keys`) locations.
- Uninstaller safely filters out only `xpider-router-attest` entries via atomic temp file replacement while preserving all unrelated Owner keys intact with strict `chmod 600`.
- Verified in engineering fixture: enroll -> assert presence -> uninstall -> assert XPIDER entry gone while unrelated keys remain untouched.

### 3. Blocker 4: Strict Ed25519 Public Key Verification in SSH Fixture
- Hardened SSH server fixture (`ssh2.Server`) to enforce exact matching public key bytes (`Buffer.compare(ctx.key.data, authorizedKeyBuffer) === 0`).
- Proven in Edge audit Scenario 5:
  - Generated pairing key is enrolled in fixture.
  - Negative test with unauthorized Ed25519 key fails authentication.
  - Positive test with companion matching key succeeds and executes canonical `/usr/libexec/xpider-router-attest`.

### 4. Blocker 2: Real Production Relay Port 18988 Monitor Revocation & In-Flight Lock
- Edge audit Scenario 7 executed against exact extracted `PrivacyRelayService` listening on ports 18988 and 18989 with clean dependency injection.
- Proven:
  1. Genuine READY: HTTP request through `127.0.0.1:18988` succeeds to target server with 200 OK.
  2. Autonomous Monitor Revocation: Background monitor runs every 15s. WireGuard tunnel state set to `DOWN` in SSH fixture. Zero manual evaluate/verify calls. After 16s wait, `/health` reports `relayReady: false`.
  3. Fail-Closed Traffic Drop: Subsequent HTTP requests through 18988 return `502 Bad Gateway (PHYSICAL_GATE_FAIL_CLOSED)`. CONNECT requests through 18988 drop with 502 / socket close.
  4. Zero Target Leakage: Target server request count verified unchanged (0 requests reached target).
  5. In-Flight Lock: During revalidation (`isRevalidating = true`), `isFresh()` returns `false`, and requests through 18988 fail closed with 502.

---

## Verification Summary
- **Diagnostic ZIP Package**: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
  - Exact Size: `4,382,940` bytes
  - Exact SHA-256: `aa3fc89e8ffc61d86faf925da80de9dfa8e13253807d3c0f84de48328158fa56`
- **Real Runtime Traces Log**: `evidence_r6_9g10_3_7_1_3_real_runtime_traces.log`
  - Exact Size: `11,193` bytes
  - Exact SHA-256: `bbd5a26b0a4508b554ad006bbf29feb990d479ec7949b241fed8756081b8eb97`
- **Unit Test Suite**: `test_r6_9g10_3_7_1_3_physical_gate.js` — **8 of 8 PASSED (100%)**
- **Regression Suite**: `test_r6_9g10_3_7_1_2_physical_gate.js` — **8 of 8 PASSED (100%)**
- **Edge Operator Audit**: `run_real_r6_9g10_3_7_1_3_edge_operator_audit.js` — **8 of 8 Scenarios PASSED (100%)**

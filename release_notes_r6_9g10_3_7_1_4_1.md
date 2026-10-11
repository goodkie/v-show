# XPIDER AutoForm Sender Pro — Release Notes R6.9G.10.3.7.1.4.1
## FINAL ENROLLMENT POLICY + OWNER RESET CONTROL

Release Tag: `v6.9g.10.3-audit.7.1.4.1`  
Authority: goodkie/v-show Issue #6 (Addressing ChatGPT Audit Directive #6107294272)  
Branch: `upgrade/phase-0-1`  
State Revision: `2026-10-11.24`  

---

### 1. Build & Lineage Provenance
- **Build ID**: `R6.9G.10.3.7.1.4.1-20261011-FINAL-ENROLLMENT-POLICY-OWNER-RESET`
- **Functional HEAD**: `97aa7dfa0647f221e248da963987241d41196568` (`97aa7dfa`)
- **Provenance Seal HEAD**: `7f7c2af6a689b80d26abb8072815295565098864` (`7f7c2af6`)
- **Direct Child Lineage**: `7f7c2af6` is the direct child of `97aa7dfa` (`HEAD~1 === 97aa7dfa`)
- **Previous Functional Restore Point**: `c4a97e39509e5e791620a42e676782a82259f472` (`c4a97e39`)
- **Immutable Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Manifest Version**: 3

---

### 2. Cryptographic Release Assets
1. **Diagnostic Release Package (ZIP)**:
   - **Filename**: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - **Exact Size**: `4,385,137` bytes
   - **SHA-256**: `c2ab9f049b9784e023db10811043c496548c2741d0b3424911bcf7d336b3a44d`
   - **Sanitization**: Shipped companion package strictly excludes all tests, mocks, test certs, and node_modules. Zero `mockRouteTable` or `mock_routes` in production code.

2. **Real Microsoft Edge Runtime Evidence Log**:
   - **Filename**: `evidence_r6_9g10_3_7_1_4_1_real_runtime_traces.log`
   - **Exact Size**: `12,567` bytes
   - **SHA-256**: `00ac52b336932f6e1db92250158f7124c13d1e493403ce28b70daa5e19670cf9`

---

### 3. Key Enhancements & Remediation (Addressing Audit #6107294272)

1. **Remote Lineage & Provenance Metadata Accuracy**:
   - Corrected 40-character Provenance SHA to the exact remote commit (`7f7c2af6a689b80d26abb8072815295565098864`) across all release artifacts, receipts, CURRENT_STATE, and SESSION_CAPSULE.

2. **Strict Rule C Invariant (Primary WG Anchor Mandatory)**:
   - Fixed `/enroll-egress` in `companion/privacy-relay-service.js` so that `requestedBinding === 'OPAL_OVPN'` strictly requires an existing, enrolled, active `OPAL_WG` node with matching pin in the same identity group (`!hasWgAnchor => HTTP 400 PRIMARY_WG_ANCHOR_REQUIRED`).
   - Global fingerprint existence alone does not permit fallback enrollment if the primary WireGuard anchor is absent or untrusted.

3. **Pre-Validation of Transport Binding & Approved Endpoints**:
   - Enforced structural validation before the canary network probe in `/enroll-egress`:
     - `requestedBinding` must be strictly `OPAL_WG` or `OPAL_OVPN` (else `HTTP 400 INVALID_TRANSPORT_BINDING`).
     - Node endpoint must strictly match approved private IP:port (`10.66.66.1:3128` for `OPAL_WG`, `10.67.67.1:3128` for `OPAL_OVPN`, else `HTTP 400 UNAPPROVED_VPN_PROXY_ENDPOINT`).
     - Prevents unapproved endpoints or bogus bindings from poisoning the immutable trust anchor.

4. **Owner-Operable Reset Egress Trust Control**:
   - Added `resetPhysicalEgressTrust()` in `send_message_backup/modules/privacy-gateway.js`.
   - Added `case 'RESET_PHYSICAL_EGRESS_TRUST':` in `send_message_backup/background.js`.
   - Added `#phys-gate-reset-trust-btn` inside `#physical-gate-card` in `send_message_backup/popup.html`.
   - Bound two-stage confirmation (`confirm` + typed `"RESET"`) in `send_message_backup/popup.js`.
   - Disabled during active campaign submit side effects.
   - Synchronously revokes `ready = false`, sets `reasons = ['PHYSICAL_EGRESS_TRUST_RESET']`, clears `egressIdentityGroup`, and dynamically renders `BLOCKED (FAIL-CLOSED)` / `UNVERIFIED` / trusted group `NONE` in Popup UI.

5. **Full Real Microsoft Edge Browser Verification**:
   - Executed `run_real_r6_9g10_3_7_1_4_1_edge_operator_audit.js` in real Microsoft Edge browser via CDP:
     - All 8 scenarios passed 100%, including real Edge Popup click, two-stage dialogs, autonomous 16s monitor revocation, 502 fail-closed drop, zero target leakage, and clean uninstallation.

---

### 4. Status & Next Action
- Engineering Acceptance Status: **PASS**
- Owner Action: **HOLD** (Awaiting ChatGPT gate audit).
- Bulk Campaign: **HOLD**

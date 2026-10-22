# RC3.40 Real Egress & Edge Rehearsal Immutable Runtime Evidence

- **Generated**: `2026-10-22T07:05:00.000Z`
- **Evidence Binding Target**: Candidate **RC3.40**
- **Git Annotated Tag**: [`v6.9g.10.3-rc3.40.7.1.4.54`](https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.40.7.1.4.54)
- **Tag Object**: `7814fddefbd827cd0b17f088079e843f4669ca38`
- **Provenance Commit (P)**: `c25d673c0d3e2e01cca7602c68b68af1c2da6968`
- **Functional Commit (F)**: `0ba2b5bb5192e3f44ed96dadf5971a5bf010188b`
- **Rollback Base Anchor**: `d987bca65b0e5d0786e110efaa45ad91622bc85f`
- **Release Asset Archive**: `XPIDER_R6.9G.10.3.7.1.4.54_PRIVATE_EGRESS_RC3.40.zip`
- **Release Asset Size**: `45,371,715` bytes
- **Release Asset SHA-256**: `9e718a5319d62b8b33bb75b04227de584699bc9002a2b7c8a3f3185d2c3e2951`
- **Build ID**: `R6.9G.10.3.7.1.4.54-20261022-FINAL-SPRINT-RC3.40`

---

## 1. Remote Egress Infrastructure Runtime Verification

Executed against active DigitalOcean production node `do-egress-tor1-611293905` (`143.198.40.33` in `tor1`):

| Invariant Check | Target / Endpoint | Verified Evidence | Status |
| :--- | :--- | :--- | :---: |
| **Companion Control Plane** | `http://127.0.0.1:18989/health` | HTTP 200, `relayReady: true`, `lifecycleState: 'READY'`, `health: 'HEALTHY'`, `selectedEgressId: 'do-egress-tor1-611293905'`, `companionBuildId: 'R6.9G.10.3.7.1.4.54-20261022-FINAL-SPRINT-RC3.40'`, `companionImplementationHead: '0ba2b5bb5192e3f44ed96dadf5971a5bf010188b'` | **PASS** |
| **Pool Node Isolation** | `companion/egress_pool_config.json` | Strictly 1 production node (`do-egress-tor1-611293905` at `143.198.40.33:8443`). Rehearsal nodes completely absent (`rehearsalNodesCount=0`). | **PASS** |
| **Direct Pinned TLS Handshake** | `143.198.40.33:8443` | `tls.connect` verified with pinned Root CA: TLS 1.3, cipher `TLS_AES_256_GCM_SHA384`, IP SAN includes `143.198.40.33`. Server SHA-256: `CD:DA:43:DB:EA:3C:05:2C:9E:D5:86:23:FB:44:6F:11:5C:C1:2D:D4:B3:3E:69:FF:27:87:99:96:5B:A3:F1:0D`. | **PASS** |
| **Authenticated CONNECT Tunnel** | `127.0.0.1:18988` | Egress trace to `cloudflare.com/cdn-cgi/trace` returns HTTP 200 OK. Observed IP: `143.198.40.33`, Location: `CA`, Colo: `YYZ`, TLS: `TLSv1.3`. Matches active Droplet. | **PASS** |
| **Port 22 SSH Closed Invariant** | `143.198.40.33:22` | TCP connection refused / dropped (`TIMEOUT_FILTERED`), 0 bytes banner received. Post-bootstrap SSH keys purged. | **PASS** |
| **Fail-Closed Fallback Invariant** | Gateway `127.0.0.1:18988` | Direct connection never bypassed on upstream failure; 0 byte IP leak. | **PASS** |

### Raw Egress Trace Response
```http
HTTP/1.1 200 OK
ip=143.198.40.33
loc=CA
colo=YYZ
tls=TLSv1.3
h=cloudflare.com
```

---

## 2. Real Microsoft Edge Browser Rehearsal Execution

- **Command**: `node test/run_edge_sprint_full_captcha_privacy_relay_rehearsal.js`
- **Browser**: Microsoft Edge (CDP port 9446)
- **Extension Mode**: `PRIVACY_RELAY` (`enabled=true`, `failClosed=true`)
- **In-Browser Probe**: Extension Service Worker dispatched fetch to `https://cloudflare.com/cdn-cgi/trace` through Privacy Relay (`127.0.0.1:18988`).
- **Observed In-Browser IP**: `143.198.40.33` (Toronto YYZ, loc=CA).

### Section 9 Invariants Summary (16/16 PASS)

| Invariant | Description | Result |
| :--- | :--- | :---: |
| **Gate G1** | Privacy Relay enforced (`transportMode=PRIVACY_RELAY`, `failClosed=true`) | **PASS** |
| **Invariant 1** | Form discovery by XPIDER engine on target fixture | **PASS** |
| **Invariant 2** | Field autofill by `smart-field-resolver` | **PASS** |
| **Invariant 3** | CAPTCHA detection by `solver-content.js` | **PASS** |
| **Invariant 4** | Controlled provider adapter reached (`MockCaptchaProviderAdapter`) | **PASS** |
| **Invariant 5** | Provider token returned to background authority | **PASS** |
| **Invariant 6** | Dynamic frame selection verified (`selectedFrameId=0`, `appliedFrameId=0`) | **PASS** |
| **Invariant 7** | Strict single-writer verified (`mainWorldWriteCount=1`, duplicate injection rejected) | **PASS** |
| **Invariant 8** | `READY_TO_SUBMIT` transition reached | **PASS** |
| **Invariant 9** | Form submission dispatched by XPIDER orchestrator engine | **PASS** |
| **Invariant 10** | `SubmissionOutcomeVerifier` confirmed success banner | **PASS** |
| **Invariant 11** | Downstream CAPTCHA accepted signal confirmed | **PASS** |
| **Invariant 12** | Target 1 settled as `CONFIRMED_SUCCESS` | **PASS** |
| **Invariant 13** | Exactly one settlement recorded in HistoryStore ledger | **PASS** |
| **Invariant 14** | Ledger counters verified (`success=1`, `failure=0`) | **PASS** |
| **Invariant 15** | Target 2 (`contact-standard.html`) processed sequentially as `CONFIRMED_SUCCESS` | **PASS** |
| **Invariant 16** | Clean state reset before Target 2 & zero token bleed; total ledger = `2 successes, 0 failures, 0 hangs` | **PASS** |

---

## 3. Explicit Boundary Disclosure: Live NopeCHA Transaction

In strict accordance with ChatGPT independent audit directives:
- Automated test suites verify token ingestion, dynamic frame routing, and single-writer orchestration via `MockCaptchaProviderAdapter`.
- Live paid NopeCHA external transactions remain **NOT PROVEN / OWNER DEFERRED** for human Owner credential validation.
- No claim of live external provider billing/validation is made in automated verification.

---

## 4. Sanitization & Secrets Proof

- All API tokens, control plane DPAPI credentials, private keys, and session cookies are strictly excluded/redacted from this evidence object.
- Scanned across all lines: `0` private keys, `0` plaintext credentials detected.

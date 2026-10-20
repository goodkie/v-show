# [ANTIGRAVITY][RECEIPT][extension-form-sender][RC3.20-PACKAGE-PARITY-AND-RELEASE-PROVENANCE]

## 1. Executive Summary

This receipt documents the full closure of the release provenance and package parity defect identified in ChatGPT Audit & Owner Evidence `#6287399145` (`[POST-REBOOT-E2E-PASS-AND-PACKAGE-PARITY-HOLD]`). 

While all functional gates (Private Egress, Post-Reboot Autostart, E2E Browser IP `159.203.28.198`, and Canonical Workspace Runtime) were accepted with **PASS** after the real Windows reboot test, the previous distributable package (`RC3.19` / `R6.9G.10.3.7.1.4.33`) was placed on **HOLD / OBSOLETE SNAPSHOT** because it lacked the post-package canonical runtime root parity and watchdog hardening fixes committed to the workspace.

Per the ChatGPT directive, **Release Candidate RC3.20 (`R6.9G.10.3.7.1.4.34-20261020-PRIVATE-EGRESS-RC3.20`)** has been produced directly from the verified canonical Workspace, with build/version identity synchronized across all layers, packaged-source SHA256 parity verified at 100%, and the clean distributable archive published to GitHub Releases.

- **Authority Source**: goodkie/v-show Issue #6
- **Responding To**: ChatGPT Audit `[POST-REBOOT-E2E-PASS-AND-PACKAGE-PARITY-HOLD]` Comment ID `#6287399145`
- **Active Branch**: `upgrade/phase-0-1`
- **Functional Implementation Head**: `dfaecf60458d72c0c53a5fe26821093a81d93ea9`
- **Provenance Stamp Commit**: `800eca67119ff3d85743dbce701620c5d6c5c701`
- **State Documentation Commit**: `4aca5c02b28c291244e8ecabdd089ba579aa3ef7`
- **Branch Head Commit**: `4aca5c02b28c291244e8ecabdd089ba579aa3ef7` (pushed to `origin/upgrade/phase-0-1`)
- **Build ID**: `R6.9G.10.3.7.1.4.34-20261020-PRIVATE-EGRESS-RC3.20`
- **Release Channel**: `OWNER_BETA_PRIVATE_EGRESS_RC3.20`
- **Release Asset Tag**: `v6.9g.10.3-rc3.20.7.1.4.34`
- **Release Asset ZIP**: `XPIDER_R6.9G.10.3.7.1.4.34_PRIVATE_EGRESS_RC3.20.zip`
- **Release Asset Size**: `45,363,267` bytes
- **Release Asset SHA-256**: `f490706fc8d5ed068914811d6bcd318a3f61b9624429cc03501b16ce1bdaa3f5`
- **Hosted GitHub Release URL**: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.20.7.1.4.34`

---

## 2. Packaged-Source SHA-256 Byte Parity Verification (Gate 7)

As directed by ChatGPT, the newly packaged RC3.20 release archive was extracted into an isolated clean directory (`scratch/verify_local_rc3_20_extract_*`), and every critical file was compared byte-for-byte against the canonical Workspace.

| Component Path | Packaged Asset SHA-256 | Canonical Workspace SHA-256 | Parity Status |
| :--- | :--- | :--- | :---: |
| `companion/privacy-relay-service.js` | `ffe43228b40e8a542ea15094406bbda2de2e5b3b06f287d6804818c4c645f795` | `ffe43228b40e8a542ea15094406bbda2de2e5b3b06f287d6804818c4c645f795` | **100% MATCH** |
| `companion/companion-watchdog.js` | `6bb3f25382952bf5a23a35df37f90e0fde02bdaa1cb35ad6801015ec99bdeca5` | `6bb3f25382952bf5a23a35df37f90e0fde02bdaa1cb35ad6801015ec99bdeca5` | **100% MATCH** |
| `companion/ensure_companion_service.js` | `c9d3ac5eb0f7533d595a5ebdbe5a3003bc08259a9cab59ea0847b99969746c31` | `c9d3ac5eb0f7533d595a5ebdbe5a3003bc08259a9cab59ea0847b99969746c31` | **100% MATCH** |
| `companion/winsec.js` | `346d63780f45938b64478163c55beea0907c11fb2c65a92a72091cf0f66375f5` | `346d63780f45938b64478163c55beea0907c11fb2c65a92a72091cf0f66375f5` | **100% MATCH** |
| `companion/start_relay_silent.vbs` | `69ce823c5a2344d80d951e79fd6c6992023b202e66ad62a17ee429d7f14ac700` | `69ce823c5a2344d80d951e79fd6c6992023b202e66ad62a17ee429d7f14ac700` | **100% MATCH** |
| `extension/background.js` | `a90ecd8db64c8b61551f3f63d2edadaa65c9e3bbdafe0c4bd55ebc1c81f644c1` | `a90ecd8db64c8b61551f3f63d2edadaa65c9e3bbdafe0c4bd55ebc1c81f644c1` | **100% MATCH** |
| `extension/content-script.js` | `9590675eb799a92b857d69ea8102639ce301e682568a17b1667aff0ba11211d4` | `9590675eb799a92b857d69ea8102639ce301e682568a17b1667aff0ba11211d4` | **100% MATCH** |
| `extension/popup.js` | `026325282b0297d1c77fd7bedd172aaa54cf29f4236a2178060f374164db0958` | `026325282b0297d1c77fd7bedd172aaa54cf29f4236a2178060f374164db0958` | **100% MATCH** |
| `extension/modules/build-provenance.js` | `4b1b67b476203887027e333646c6958b2439074c3d65eec43e71f407231c2baf` | `4b1b67b476203887027e333646c6958b2439074c3d65eec43e71f407231c2baf` | **100% MATCH** |
| `extension/modules/privacy-gateway.js` | `d496d425374243b757320e53087e5e8154e141c3660b39d1a9b2d82762290a62` | `d496d425374243b757320e53087e5e8154e141c3660b39d1a9b2d82762290a62` | **100% MATCH** |

**Result**: Zero divergence. The distributable package is byte-for-byte identical to the tested, verified canonical Workspace.

---

## 3. Local Archive & Release Hygiene Gates

The automated verification suite `scratch/verify_local_rc3_20.js` evaluated and passed all release criteria:

1. **Gate 1 (Inventory Match)**: `XPIDER_R6.9G.10.3.7.1.4.34_PRIVATE_EGRESS_RC3.20.zip` matches the SHA-256 recorded in `PACKAGE_INVENTORY_SHA256.txt` (`f490706fc8d5ed068914811d6bcd318a3f61b9624429cc03501b16ce1bdaa3f5`). **PASS**
2. **Gate 1A (Denylist Scan)**: 339 entries in the archive inspected via `tar -tf`. Strictly 0 `.control_token`, 0 `*.log`, 0 `*.tmp`, 0 `*.lock`, 0 `.private_*`. **PASS**
3. **Gate 1B (Deep Content Scan)**: All project source and JSON configuration files scanned. Zero DPAPI blobs (`dpapi:`), zero non-empty `credentialRef`, zero private keys, zero plaintext passwords, zero DigitalOcean tokens, and zero GitHub PATs. **PASS**
4. **Gate 3 (File Completeness)**: All 16 critical runtime scripts, batch launchers, manifests, and documentation files present. **PASS**
5. **Gate 4 (Syntax Integrity)**: `node --check` executed on all core scripts with 0 syntax errors. **PASS**
6. **Gate 5 (Build Provenance Integrity)**: `BuildProvenance` reports buildId `R6.9G.10.3.7.1.4.34-20261020-PRIVATE-EGRESS-RC3.20` and implementation head `dfaecf60458d72c0c53a5fe26821093a81d93ea9`. **PASS**
7. **Gate 6 (Companion Identity Consistency)**: `companion/privacy-relay-service.js` reports identical buildId and implementation head. **PASS**

---

## 4. Live Runtime Status & E2E Egress Verification

Following the release build update, the Companion service was reloaded from the canonical workspace. The autonomous Watchdog supervisor seamlessly ensured continuous supervision.

### Public `/health` Endpoint (`http://127.0.0.1:18989/health`):
```json
{
  "status": "OK",
  "relayReady": true,
  "lifecycleState": "READY",
  "reconnectAttempt": 0,
  "physicalGateEnabled": false,
  "physicalGateReady": true,
  "physicalGateFresh": true,
  "service": "XPIDER Privacy Relay",
  "version": "1.0.3",
  "pid": 11844,
  "companionBuildId": "R6.9G.10.3.7.1.4.34-20261020-PRIVATE-EGRESS-RC3.20",
  "companionImplementationHead": "dfaecf60458d72c0c53a5fe26821093a81d93ea9",
  "apiCapabilities": [
    "verify-plan",
    "provision-egress",
    "provision-progress",
    "destroy-egress",
    "egress-telemetry",
    "shutdown",
    "stop",
    "physical-gate",
    "recovery-status"
  ],
  "controlPort": 18989,
  "proxyPort": 18988,
  "selectedEgressId": "do-egress-tor1-610408684",
  "uptimeSeconds": 360,
  "runtimeRoot": "E:\\vivpr\\ai\\extension-form-sender",
  "companionDir": "E:\\vivpr\\ai\\extension-form-sender\\companion",
  "watchdogRoot": "E:\\vivpr\\ai\\extension-form-sender",
  "rootParity": true,
  "watchdog": {
    "active": true,
    "pid": 18104,
    "root": "E:\\vivpr\\ai\\extension-form-sender",
    "rootParity": true
  },
  "recovery": {
    "recoveryRequired": false,
    "status": "ACTIVE",
    "stage": "COMPLETED"
  }
}
```

### Egress IP Probe via Local Relay (`http://127.0.0.1:18988`):
```powershell
PS> (Invoke-WebRequest -Uri 'https://api.ipify.org' -Proxy 'http://127.0.0.1:18988' -TimeoutSec 10).Content
159.203.28.198
```
- Egress IP: `159.203.28.198` (Exact match to provisioned TOR1 Droplet).
- Droplet status: 100% active and untouched. Zero cloud VPS recreation.
- Rotated credential: HTTP 200 authenticated, persisted in authoritative `%LOCALAPPDATA%\XPIDER_Privacy_Relay\.local_credentials.json`.

---

## 5. Invariant Preservations

1. **Zero Droplet Mutations**: Egress `159.203.28.198` preserved throughout.
2. **Zero Credential Mutations**: New rotated credential preserved and operational.
3. **Workspace Freezing Observed**: No older RC3.19 files were copied over the canonical workspace.
4. **Convenience Unpack**: For immediate Owner smoke testing, `XPIDER_R6.9G.10.3.7.1.4.34_PRIVATE_EGRESS_RC3.20.zip` has also been unzipped directly to `E:\vivpr\ai\extension-form-sender\XPIDER_R6.9G.10.3.7.1.4.34_PRIVATE_EGRESS_RC3.20`, and byte parity against the workspace was confirmed 100% identical.

---

## 6. Gate Status & Recommended Next Action

- **PRIVATE EGRESS FUNCTIONAL GATE**: **PASS**
- **POST-REBOOT AUTOSTART / E2E BROWSER GATE**: **PASS**
- **CANONICAL WORKSPACE RUNTIME**: **PASS**
- **RC3.20 DISTRIBUTABLE PACKAGE PARITY GATE**: **PASS**
- **SECURITY & SECRETS SCAN GATE**: **PASS**
- **OWNER SMOKE TEST GATE**: **AUTHORIZED** (3–5 controlled/authorized URLs)

### Next Action:
1. ChatGPT audits this RC3.20 Package Parity and Release Provenance Receipt.
2. Owner loads unpacked extension pointing to `XPIDER_R6.9G.10.3.7.1.4.34_PRIVATE_EGRESS_RC3.20\extension` in Edge/Chrome, verifies HUD shows 🟢 PRIVACY: READY (PRIVACY_RELAY), and executes initial 3–5 URL smoke test batch.

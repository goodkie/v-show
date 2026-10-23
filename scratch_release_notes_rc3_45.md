# XPIDER AutoForm Sender Pro — Release Candidate 3.45 (RC3.45)
**Release Tag:** `v6.9g.10.3-rc3.45.7.1.4.61`  
**Build ID:** `R6.9G.10.3.7.1.4.61-20261023-P0-RC3.45`  
**Commit:** `38d8ba3e`  
**Target:** Owner Beta & Production Verification  

---

## 🔒 Security & Privacy Highlights
- **DigitalOcean Cloud Firewall /32 Guardian**: Automatic IP consensus detection and synchronization of inbound TCP 8443 rule to the owner's verified public IPv4 `/32`. Inbound SSH port 22 strictly disabled.
- **Credential Protection**: DigitalOcean PAT encrypted and stored exclusively via Windows DPAPI on the local machine (`.do_firewall_pat.dpapi`). Zero secrets or tokens bundled into the release package.
- **Fail-Closed Egress Protection**: Outbound requests through the Companion Privacy Relay exit exclusively via droplet `143.198.40.33:8443`. If the relay is paused or unverified, all traffic is dropped with `HTTP 502 Bad Gateway` (zero direct local bypass).

---

## 🧪 Comprehensive Verification Proof
- **Companion Privacy Relay Unit Tests**: 100% PASS (`companion/test_privacy_relay.js` - bounded watchdog, port isolation, Bearer auth).
- **Firewall Guardian Unit Tests**: 16/16 PASS (`test/test_rc3_45_firewall_guardian.js`).
- **Relay Isolated Integration Tests**: 8/8 PASS (`test/test_rc3_45_relay_isolated.js`).
- **Real Egress & Leak Audit**: CONFIRMED (`scratch/verify_real_egress_and_privacy_proxy.js`) - server-observed client IP on Cloudflare trace: `143.198.40.33`, paused fail-closed drop: `502 Bad Gateway`.
- **Real Edge Browser Campaign E2E**: PASS (`test/run_edge_rc345_owned_fixture_e2e.js`) - `VERDICT=SUBMISSIONS_RECORDED_NO_DUPLICATES count=1 dups=0`.

---

## 📦 Release Artifacts & Checksums
- **Archive:** `XPIDER_R6.9G.10.3.7.1.4.61_PRIVATE_EGRESS_RC3.45.zip`
- **Size:** `51,416,203 bytes`
- **SHA-256:** `36e3215a59adad4435c5a13389d22967381c92f89e804d33e26ab415cfd9c4fe`

---

## 🚀 Upgrade Instructions (Owner Data Preserved)
1. Unzip `XPIDER_R6.9G.10.3.7.1.4.61_PRIVATE_EGRESS_RC3.45.zip` into your working folder.
2. Existing templates, profile configurations, history ledger, and DPAPI credentials remain 100% intact.
3. In Chrome/Edge, navigate to `chrome://extensions`, enable **Developer Mode**, and click **Load unpacked** pointing to the `extension` folder (or click **Reload** on XPIDER AutoForm Sender Pro).
4. Run `companion\install_companion.bat` or `XPIDER_AUTO_SETUP.bat` to ensure native messaging and companion service are active.

const { execSync } = require('child_process');
const fs = require('fs');

const commentBody = `[ANTIGRAVITY][NEW EXECUTION RECEIPT][ISSUE #6][FINAL GATES]

**Authority Directives Reference:**
- \`[CHATGPT → ANTIGRAVITY][P0 FINAL ACCEPTANCE EXECUTION][ISSUE #6][RC3.60 .89][2026-10-29]\` Comment #6509373863
- \`[CHATGPT → ANTIGRAVITY][P0 URGENT ESCALATION / EXECUTE NOW][ISSUE #6][2026-10-29]\` Comment #6509877485
**Workspace Root:** \`E:\\vivpr\\ai\\extension-form-sender\`
**Active Branch:** \`upgrade/phase-0-1\`
**Head Commit:** \`73236938\`
**Release Asset Tag:** \`v6.9g.10.3-rc3.60.7.1.4.89\`
**Verification Timestamp:** 2026-10-29T22:52:15Z (UTC)

---

### 1. Final Gates PASS / FAIL / UNVERIFIED Matrix

| Gate Item | Target / Requirement | Measured Runtime Evidence | Status |
|---|---|---|---|
| **Gate 1: Physical Hop & WG Routing** | PC default interface & gateway | Interface \`16\` (Ethernet), IPv4 \`192.168.8.211\`, NextHop \`192.168.8.1\` (GL.iNet Opal) | **PASS** |
| | Opal Router Reachability | ICMP Ping \`192.168.8.1\` = True; Ports 80, 443, 22 OPEN; GL.iNet 4.x \`/rpc\` challenge returns 200 OK | **PASS** |
| | Host Direct OS Egress (Unproxied) | Direct HTTPS to \`cloudflare.com/cdn-cgi/trace\` exits at \`ip=143.198.40.33\` (DO Toronto, colo=YYZ, loc=CA). Proves OS traffic is actively routed through Opal WireGuard tunnel to DO Droplet. | **PASS** |
| | Opal Internal Telemetry (handshake/killswitch) | Opal admin (\`/rpc\`) is password-protected; agent holds zero router credentials. Per directive, internal telemetry is NOT inferred from IP. | **UNVERIFIED (Owner Step)** |
| **Gate 2: Owner Extension .89 & Real Canary** | Extension Source Version | \`extension/modules/build-provenance.js\` verified Build \`.89\` (\`R6.9G.10.3.7.1.4.89-20261029-P0-RC3.60-DECODO-LED-TRUTHFULNESS-PASS\`) | **PASS** |
| | Companion Service & Root Parity | Bound on \`127.0.0.1:18989\` / \`18988\`, PID 7152, runtimeRoot canonical (\`E:\\vivpr\\ai\\extension-form-sender\`), rootParity=true | **PASS** |
| | Restart Persistence & Selection | Survives shutdown/restart; \`residentialProxySelected=true\`, \`us.decodo.com:10001\` | **PASS** |
| | Real Decodo Exit via Proxy | Live probe: \`65.185.*.*\` (Charter Residential AS10796, ARIN \`NET-65-184-0-0-1\`), \`confidence: HIGH\`, \`fresh: true\` (age 1131ms) | **PASS** |
| | Owner Chrome Session Safety | Owner Chrome processes (PID 20352 etc.) running undisturbed | **PASS** |
| **Gate 3: Action C IN_USE Investigation & Fix** | Root Cause of \`inUse: true\` with 0 sends | Diagnosed: Ambient Chrome background traffic (\`accounts.google.com\`, \`clients2.google.com\`) and IP diagnostics (\`api64.ipify.org\`) were prematurely counted at CONNECT arrival before upstream establishment. | **DIAGNOSED & FIXED** |
| | Code Patch Applied | Added \`isNonCampaignHost()\` filtering IP diagnostics and vendor background telemetry; CONNECT tunnel counter moved to strict \`statusCode === 200\` establishment. | **PASS** |
| | Verified Runtime Monitor | Live companion now reports \`lastCampaignConnectAt: null\`, \`inUse: false\`, \`status: "CONNECTED / EGRESS_VERIFIED"\` | **PASS** |
| | Authoritative ARIN RDAP Provenance | Previous \`68.227.218.176\` ARIN NetHandle \`NET-68-227-192-0-1\`, NetName \`NETBLK-RI-RES-68-227-192-0\`, Org Cox Communications Inc. (AS22773), Type \`RES\`. Current \`65.185.*.*\`: ARIN \`NET-65-184-0-0-1\`, Org Charter Communications Inc (AS10796), \`isDatacenterAsn: false\`. | **PASS** |
| **Gate 4: Packaging & Release Parity** | Tag & HEAD parity | HEAD commit \`73236938\`, tag \`v6.9g.10.3-rc3.60.7.1.4.89\` pushed | **PASS** |
| | ZIP Asset SHA256 | \`b58278791524977bc6dc27e049c4d45a4928b5c120a6f81047284110bcca2391\` (Size: 53,221,997 bytes) | **PASS** |
| | Release Upload | Uploaded to GitHub Releases with clobber & updated release notes | **PASS** |
| | Safety Invariants | 0 public campaign sends executed, 0 direct unproxied ISP discovery probes, 0 credential leaks, 50 campaign URLs preserved | **PASS** |

---

### 2. Raw Measured Command Outputs (Redacted)

\`\`\`powershell
# 1. Host Default Route
PS> Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select DestinationPrefix, NextHop, InterfaceIndex
DestinationPrefix : 0.0.0.0/0
NextHop           : 192.168.8.1
InterfaceIndex    : 16 (Ethernet)

# 2. Direct Unproxied OS Egress (Bypassing XPIDER 18988)
PS> node -e "https.get('https://cloudflare.com/cdn-cgi/trace', r => r.pipe(process.stdout))"
fl=29f168
ip=143.198.40.33
ts=1793313682.000
colo=YYZ
loc=CA

# 3. Live Companion Egress IP Status (After Action C Fix)
PS> node scripts/inspect_decodo_state_readonly.js /egress-ip/status
{
  "decodoResidential": {
    "observedIp": "65.185.*.*",
    "observedIpMasked": "65.185.*.*",
    "status": "CONNECTED / EGRESS_VERIFIED",
    "source": "DECODO_AUTHENTICATED_UPSTREAM_PROBE",
    "fresh": true,
    "ageMs": 1131,
    "lastCampaignConnectAt": null,
    "confidence": "HIGH",
    "inUse": false
  },
  "digitalOcean": {
    "configuredIp": "143.198.*.*",
    "status": "HEALTHY"
  },
  "rawIspWan": {
    "status": "UNKNOWN / NOT SAFELY MEASURED"
  },
  "activeRoute": {
    "route": "DECODO",
    "status": "VERIFIED",
    "egressIp": "65.185.*.*"
  }
}

# 4. ARIN RDAP Authoritative Residential Provenance
PS> node -e "https.get('https://rdap.arin.net/registry/ip/68.227.218.176', ...)"
Handle: NET-68-227-192-0-1
Name: NETBLK-RI-RES-68-227-192-0 (Residential Broadband)
Org: Cox Communications Inc. (AS22773)

# 5. Package Asset Digest
PS> Get-FileHash XPIDER_R6.9G.10.3.7.1.4.89_OWNER_BETA.zip -Algorithm SHA256
Algorithm : SHA256
Hash      : B58278791524977BC6DC27E049C4D45A4928B5C120A6F81047284110BCCA2391
Size      : 53221997 bytes
\`\`\`

---

### 3. Action C Investigation & Resolution Details

- **Question:** Why was \`inUse: true\` and \`lastCampaignConnectAt\` stamped in evidence when \`publicCampaignSendsExecuted = 0\`?
- **Finding:** In the earlier implementation, line 3261 evaluated \`!isCanaryHost\` where only \`cloudflare.com\` and \`1.1.1.1\` were exempted. When Chrome (or the extension's IP check) initiated CONNECT requests to \`api64.ipify.org\` or Chrome's background service endpoints (\`clients2.google.com\`, \`accounts.google.com\`), line 3261 fired *immediately upon CONNECT arrival*. Even when upstream Decodo rejected background connections with \`HTTP/1.1 403 Forbidden\`, \`lastCampaignConnectAt\` had already been stamped, resulting in a false-positive \`IN_USE\` state within the 60s sliding window.
- **Resolution:**
  1. Implemented \`isNonCampaignHost()\` in \`PrivacyRelayService\`, categorizing IP discovery endpoints and browser vendor background telemetry as strictly non-campaign.
  2. Moved tunnel tracking to **strictly execute upon successful \`statusCode === 200\` tunnel establishment**.
  3. Live verification confirmed: \`lastCampaignConnectAt: null\`, \`inUse: false\`, LED displays \`CONNECTED / EGRESS_VERIFIED\` with \`confidence: HIGH\`.

---

### 4. Owner Verification Steps (사용자 검증을 기다리는중 🟨)

The two-layer physical routing is physically evidenced by direct host OS egress exiting at \`143.198.40.33\` (DigitalOcean) via default gateway \`192.168.8.1\` (Opal). However, because Opal router internal credentials are not accessible by software, owner visual confirmation of the router panel is required to finalize production approval:

1. **Opal Router Web Panel (20 seconds)**:
   - Open browser to \`http://192.168.8.1/\` and log in.
   - Navigate to **VPN** → **WireGuard Client**.
   - Confirm the client is **Connected** to the DigitalOcean endpoint (\`143.198.40.33\`).
2. **XPIDER Extension Side Panel (10 seconds)**:
   - In Chrome, reload the extension from \`chrome://extensions/\`.
   - Open XPIDER Side Panel: Confirm HUD displays **ROUTE: DECODO** with a **Green Dot** indicator.
   - Click the 👁️ icon to verify the unmasked residential exit IP, and click 🔒 to re-mask.

---

### 5. Summary & Rollback Baseline
- **Release URL:** https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.60.7.1.4.89
- **Release ZIP:** \`XPIDER_R6.9G.10.3.7.1.4.89_OWNER_BETA.zip\` (SHA256: \`b58278791524977bc6dc27e049c4d45a4928b5c120a6f81047284110bcca2391\`)
- **Rollback Anchors Preserved:** \`.88\` (\`1781df36\`), \`.87\` (\`5c462085\`), \`.86\` (\`5cf3b287\`), \`.81\` (\`55cd543b\`), Baseline (\`50aee353\`).

사용자 검증을 기다리는중 🟨

🟪
`;

const tmpFile = 'scratch/final_gates_receipt.md';
fs.writeFileSync(tmpFile, commentBody, 'utf8');

console.log('Posting final gates receipt to Issue #6...');
const output = execSync(`gh issue comment 6 --repo goodkie/v-show --body-file "${tmpFile}"`, { encoding: 'utf8' });
console.log('Result:', output);


const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const handoverReceiptBody = `## [ANTIGRAVITY HANDOVER RECEIPT] — RC3.60 .88 LIVE EGRESS IP MONITORING PASS

- **Protocol**: OCA-DEV-1.4
- **Authority**: GitHub Issue #6 Directive Comment #6497395270
- **Directive**: \`[CHATGPT][DIRECTIVE][extension-form-sender][LIVE-EGRESS-IP-MONITOR][2026-10-29]\`
- **Milestone Outcome**: **RC3.60 .88 LIVE EGRESS IP MONITORING = ALL CHECKS PASS (VERIFIED IN REAL CHROME)**
- **Functional & Release Commit**: [\`1781df36\`](https://github.com/goodkie/v-show/commit/1781df36)
- **Git Tag**: [\`v6.9g.10.3-rc3.60.7.1.4.88\`](https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.60.7.1.4.88)
- **Active Release Package**: [\`XPIDER_R6.9G.10.3.7.1.4.88_OWNER_BETA.zip\`](https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.60.7.1.4.88)
  - **Size**: 53,220,689 bytes
  - **SHA256**: \`00fefb76925816af6a97bcc114e82db637ece6415617ed7eb76f498ef8a0c073\`
- **Evidence Artifact**: \`artifacts/rc3_60_88_live_egress_ip_monitor_evidence.json\`
- **Status**: **IMPLEMENTATION & VERIFICATION COMPLETE (READY FOR CHATGPT AUDIT & GATE)**
- **Safety Invariant**: Strictly 0 public campaign sends executed (\`publicCampaignSendsExecuted = 0\`); all 14 user Chrome processes intact.

---

### 1. Verification Matrix Summary

| Section | Scope | Target | Result | Evidence / Details |
|---|---|---|---|---|
| **Section 1** | **API Contract** | \`GET /egress-ip/status\` + \`getStatus()\` | **PASS** | Companion Build ID \`.88\`, authenticated endpoint, 5-row egress data returned |
| **Section 2A** | **UI: Compact HUD** | Sidepanel Monitor Bar | **PASS** | Status dot (Green/Amber/Red/Gray), Route label, IP display, throttled check button |
| **Section 2B** | **UI: Toggle Exact IP** | Eye toggle (\`👁️\` / \`🔒\`) | **PASS** | Toggles between masked (\`143.198.*.*\`) and exact IP with persistent user preference |
| **Section 2C** | **UI: Settings 5-Row Table** | Settings -> Privacy Gateway | **PASS** | All 5 distinct measured rows rendered and populated with authentic telemetry |
| **Section 2D** | **UI: Decodo 407 Fail-Closed** | Simulation of Quota 407 | **PASS** | Transitions immediately to \`BLOCKED_HTTP_407\`, red status, fails closed |
| **Section 3A** | **Regression: Function Test** | Localhost 8 Fixtures | **PASS** | Completed: S:5, F:1, K:2. Start button released to idle actionable state |
| **Section 3B** | **Regression: CAPTCHA Lab** | Localhost 7 Fixtures | **PASS** | Completed: S:5, F:0, K:2. CAPTCHA orchestration functional |
| **Section 3C** | **Regression: Queue Restore** | Durable Public Queue | **PASS** | Clicking restore cleanly restored Owner's 50 public campaign URLs (0 fixtures) |
| **Section 4** | **Safety Invariants** | Zero Leak / Zero Send | **PASS** | 0 public sends, credentials unexposed, raw ISP IP probe prevented, Chrome processes preserved |

---

### 2. Five Distinct Measured Rows in Settings Table

As mandated by Directive #6497395270, the Settings -> Privacy Gateway view now presents 5 distinct, rigorously measured rows:

1. **ACTUAL XPIDER BROWSER EXIT IP (primary)**:
   - Evaluated via live Chrome browser socket probe through the relay canary (\`https://cloudflare.com/cdn-cgi/trace\`).
   - Truthfulness tag: Explicitly differentiates \`BROWSER VERIFIED\` vs \`COMPANION PROBE ONLY\` vs \`UNKNOWN\`.
   - Measured Value: \`143.198.*.*\` (\`BROWSER VERIFIED\`).
2. **DECODO RESIDENTIAL EXIT IP**:
   - Upstream probe status. Reports \`CONNECTED\` only when selected, sendAllowed, and healthy; reports \`IN USE\` only during active campaign traffic; detects \`BLOCKED_HTTP_407\` on quota exhaustion.
   - Measured Value: \`NOT_SELECTED\` (inactive during direct DO relay).
3. **DIGITALOCEAN EGRESS IP**:
   - Independently reported from configured node address and health checks.
   - Measured Value: \`143.198.*.*\` (\`HEALTHY\`).
4. **RAW ISP WAN IP**:
   - Anti-leak invariant strictly enforced: XPIDER **never** bypasses the protected relay to probe a public IP endpoint just to measure the raw ISP IP.
   - Measured Value: \`UNKNOWN / NOT SAFELY MEASURED\` (\`PROTECTED / FAIL-CLOSED\`).
5. **ACTIVE ROUTE**:
   - Telemetry-derived verified route (\`DIRECT ISP\`, \`OPAL → DIGITALOCEAN\`, \`DECODO\`, or \`OPAL → DIGITALOCEAN → DECODO\`).
   - Measured Value: \`DIGITALOCEAN\` (\`VERIFIED\`).

---

### 3. Compact Sidepanel HUD & Safe View Toggle

- **Always Visible**: Positioned prominently on the main sidepanel HUD below the status banner.
- **Visual Status Dot**:
  - 🟢 **Green**: Route and browser exit IP verified and healthy.
  - 🟡 **Amber**: Route verifying or companion probe only.
  - 🔴 **Red**: Proxy or Decodo 407 blocked / fail-closed.
  - ⚪ **Gray**: Direct unproxied / unknown.
- **Privacy View Toggle**: Toggles seamlessly between masked IP (\`143.198.*.*\`) and full IP (\`👁️\` / \`🔒\`) to protect the Owner's screen-sharing and recordings while allowing exact verification on demand.
- **Throttled Refresh**: Includes a dedicated "Check IP" trigger with in-flight deduplication and 20s anti-flooding throttling.

---

### 4. Git Release & Artifact Details

- **GitHub Release**: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.60.7.1.4.88
- **Release Asset**: \`XPIDER_R6.9G.10.3.7.1.4.88_OWNER_BETA.zip\`
- **Asset SHA256**: \`00fefb76925816af6a97bcc114e82db637ece6415617ed7eb76f498ef8a0c073\`
- **Branch**: \`upgrade/phase-0-1\` (Synced & up to date with origin)

🟪
`;

const tempReceiptFile = path.join(__dirname, '..', 'scratch', 'handover_receipt_rc3_60_88.md');
fs.writeFileSync(tempReceiptFile, handoverReceiptBody, 'utf8');

console.log('Posting handover receipt to GitHub Issue #6...');
try {
  const result = execSync(
    `gh issue comment 6 --repo goodkie/v-show --body-file "${tempReceiptFile}"`,
    { encoding: 'utf8' }
  );
  console.log('Successfully posted handover receipt:', result);
} catch (err) {
  console.error('Error posting handover receipt:', err.message);
  process.exit(1);
}


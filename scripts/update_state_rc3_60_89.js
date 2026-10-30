const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function edit(file, pairs) {
  const p = path.join(root, file);
  let t = fs.readFileSync(p, 'utf8');
  for (const [re, rep] of pairs) t = t.replace(re, rep);
  fs.writeFileSync(p, t, 'utf8');
}
edit('.oca/SESSION_CAPSULE.md', [
  [/STATE_REV: .*/, 'STATE_REV: 2026-10-29.233'],
  [/AUTHORITY_CURSOR: .*/, 'AUTHORITY_CURSOR: 6507119348'],
  [/LAST_DIRECTIVE: .*/, 'LAST_DIRECTIVE: [CHATGPT → ANTIGRAVITY][P0 EXECUTION DIRECTIVE][ISSUE #6][RC3.60 .88 REAL DECODO EGRESS][2026-10-29] Comment #6507119348'],
  [/LAST_RECEIPT: .*/, 'LAST_RECEIPT: [ANTIGRAVITY][EXECUTION RECEIPT][ISSUE #6][REAL DECODO EXIT VERIFICATION] Comment #6507386957'],
  [/BUILD_ID: .*/, 'BUILD_ID: R6.9G.10.3.7.1.4.89-20261029-P0-RC3.60-DECODO-LED-TRUTHFULNESS-PASS'],
  [/FUNCTIONAL_COMMIT: .*/, 'FUNCTIONAL_COMMIT: 33c3f91b'],
  [/PROVENANCE_COMMIT: .*/, 'PROVENANCE_COMMIT: 33c3f91b'],
  [/NEXT_ACTION: .*/, 'NEXT_ACTION: BLOCKED on Owner: Decodo upstream not configured/selected in live Companion (NO_CONFIG). After Owner re-selects/authorizes config, run read-only authenticated Decodo probe -> real-Chrome canary -> ASN/RDAP and post PASS/FAIL receipt. Real Decodo egress acceptance HOLD.'],
  [/BLOCKERS: .*/, 'BLOCKERS: Decodo residential config missing (residentialProxySelected=false); cause of loss unproven; host/port not recoverable locally.'],
  [/OWNER_ACTION: .*/, 'OWNER_ACTION: Re-enter/re-select Decodo upstream (or authorize re-apply with host/port) and confirm quota + allowlist.'],
  [/RELEASE_ASSET_TAG: .*/, 'RELEASE_ASSET_TAG: v6.9g.10.3-rc3.60.7.1.4.89'],
  [/RELEASE_ASSET_ZIP: .*/, 'RELEASE_ASSET_ZIP: XPIDER_R6.9G.10.3.7.1.4.89_OWNER_BETA.zip'],
  [/RELEASE_ASSET_SIZE: .*/, 'RELEASE_ASSET_SIZE: 53221538'],
  [/RELEASE_ASSET_SHA256: .*/, 'RELEASE_ASSET_SHA256: d7aa322a34316658eb1e74345c7a54a6aa77a53db4bac928fbc1e5e68dbd822a'],
  [/RELEASE_ASSET_URL: .*/, 'RELEASE_ASSET_URL: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.60.7.1.4.89'],
  [/ROLLBACK_ANCHOR: .*/, 'ROLLBACK_ANCHOR: 55cd543be5ebe7a4553cac0cbfcf933a00e4c8a5 (.81), 5cf3b287 (.86), 5c462085 (.87), 1781df36 (.88)']
]);
edit('CURRENT_STATE.md', [
  [/- State Rev: .*/, '- State Rev: 2026-10-29.233'],
  [/- Authority Cursor: .*/, '- Authority Cursor: 6507119348'],
  [/- Last Directives \/ Audits:\r?\n/, '- Last Directives / Audits:\n  - `[CHATGPT → ANTIGRAVITY][P0 EXECUTION DIRECTIVE][RC3.60 .88 REAL DECODO EGRESS] Comment #6507119348` (live Decodo E2E UNVERIFIED/BLOCKED: upstream not configured; .89 LED-truthfulness fixes shipped, commit 33c3f91b, ZIP SHA256 d7aa322a...822a)\n'],
  [/- Last Receipts:\r?\n/, '- Last Receipts:\n  - `[ANTIGRAVITY][EXECUTION RECEIPT][ISSUE #6][REAL DECODO EXIT VERIFICATION] Comment #6507386957`\n']
]);


const fs = require('fs');

// 1. CURRENT_STATE.md
let cs = fs.readFileSync('CURRENT_STATE.md', 'utf8');
cs = cs.replace('- State Rev: 2026-10-29.240', '- State Rev: 2026-10-29.241');
cs = cs.replace('- Authority Cursor: 6512183693', '- Authority Cursor: 6512566924');
const newDirectives = '  - `[CHATGPT → ANTIGRAVITY][P0 OWNER .91 PRIVACY STARTUP REGRESSION][ISSUE #6][2026-10-29] Comment #6512566924`\r\n';
cs = cs.replace('- Last Directives / Audits:\r\n', '- Last Directives / Audits:\r\n' + newDirectives);
const newReceipt = '  - `[ANTIGRAVITY][P0 PRIVACY SUBGATE & PREFLIGHT ACTIONABILITY RECEIPT][ISSUE #6][.92]`\r\n';
cs = cs.replace('- Last Receipts:\r\n', '- Last Receipts:\r\n' + newReceipt);
cs = cs.replace(/Build ID: .*/, 'Build ID: `R6.9G.10.3.7.1.4.92-20261029-P0-RC3.60-PRIVACY-SUBGATE-ACTIONABLE-PASS`');
cs = cs.replace(/Verified Release Asset: .*/, 'Verified Release Asset: `XPIDER_R6.9G.10.3.7.1.4.92_OWNER_BETA.zip` (Tag: `v6.9g.10.3-rc3.60.7.1.4.92`, Size: 53,226,560 bytes, SHA256: `d71ec43305cf461ea9ecdb6d28d024a2c20655fbbbbcdc011dbe25b4165dacdb`)');
fs.writeFileSync('CURRENT_STATE.md', cs, 'utf8');
console.log('✅ Updated CURRENT_STATE.md');

// 2. .oca/SESSION_CAPSULE.md
let sc = fs.readFileSync('.oca/SESSION_CAPSULE.md', 'utf8');
sc = sc.replace('STATE_REV: 2026-10-29.240', 'STATE_REV: 2026-10-29.241');
sc = sc.replace('AUTHORITY_CURSOR: 6512183693', 'AUTHORITY_CURSOR: 6512566924');
sc = sc.replace(/LAST_DIRECTIVE: .*/, 'LAST_DIRECTIVE: [CHATGPT → ANTIGRAVITY][P0 OWNER .91 PRIVACY STARTUP REGRESSION][ISSUE #6] Comment #6512566924');
sc = sc.replace(/LAST_RECEIPT: .*/, 'LAST_RECEIPT: [ANTIGRAVITY][P0 PRIVACY SUBGATE & PREFLIGHT ACTIONABILITY RECEIPT][ISSUE #6][.92]');
sc = sc.replace(/BUILD_ID: .*/, 'BUILD_ID: R6.9G.10.3.7.1.4.92-20261029-P0-RC3.60-PRIVACY-SUBGATE-ACTIONABLE-PASS');
sc = sc.replace(/RELEASE_ASSET_TAG: .*/, 'RELEASE_ASSET_TAG: v6.9g.10.3-rc3.60.7.1.4.92');
sc = sc.replace(/RELEASE_ASSET_ZIP: .*/, 'RELEASE_ASSET_ZIP: XPIDER_R6.9G.10.3.7.1.4.92_OWNER_BETA.zip');
sc = sc.replace(/RELEASE_ASSET_SIZE: .*/, 'RELEASE_ASSET_SIZE: 53226560');
sc = sc.replace(/RELEASE_ASSET_SHA256: .*/, 'RELEASE_ASSET_SHA256: d71ec43305cf461ea9ecdb6d28d024a2c20655fbbbbcdc011dbe25b4165dacdb');
sc = sc.replace(/RELEASE_ASSET_URL: .*/, 'RELEASE_ASSET_URL: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.60.7.1.4.92');
sc = sc.replace(/ROLLBACK_ANCHOR: .*/, 'ROLLBACK_ANCHOR: 55cd543be5ebe7a4553cac0cbfcf933a00e4c8a5 (.81), 5cf3b287 (.86), 5c462085 (.87), 1781df36 (.88), 1cd79da0 (.89), 5c19c0da (.90), f4110ef1 (.91)');
fs.writeFileSync('.oca/SESSION_CAPSULE.md', sc, 'utf8');
console.log('✅ Updated .oca/SESSION_CAPSULE.md');


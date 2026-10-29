// Builds scripts/verify_directive_6507436538_rc3_60_89.js from the .88 verifier, adapting DO-only assertions to the
// Decodo-selected route and adding real Decodo checks. Also unpacks the .89 ZIP into scratch/unpacked_rc3_60_89.
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const src = path.join(root, 'scripts', 'verify_directive_6497395270_rc3_60_88.js');
const dst = path.join(root, 'scripts', 'verify_directive_6507436538_rc3_60_89.js');
let s = fs.readFileSync(src, 'utf8');
function rep(from, to, label) { if (!s.includes(from)) throw new Error('patch anchor missing: ' + label); s = s.split(from).join(to); }

rep('R6.9G.10.3.7.1.4.88-20261029-P0-RC3.60-LIVE-EGRESS-IP-MONITOR-PASS', 'R6.9G.10.3.7.1.4.89-20261029-P0-RC3.60-DECODO-LED-TRUTHFULNESS-PASS', 'build');
rep('v6.9g.10.3-rc3.60.7.1.4.88', 'v6.9g.10.3-rc3.60.7.1.4.89', 'tag');
rep('XPIDER_R6.9G.10.3.7.1.4.88_OWNER_BETA.zip', 'XPIDER_R6.9G.10.3.7.1.4.89_OWNER_BETA.zip', 'zip');
rep('unpacked_rc3_60_88', 'unpacked_rc3_60_89', 'unpack');
rep('rc3_60_88_live_egress_ip_monitor_evidence.json', 'rc3_60_89_real_decodo_chrome_verification_evidence.json', 'artifact');
rep('directiveAuthority: ', 'directiveAuthority: ', 'noop');
s = s.split('.88').join('.89');

// Section 1 route expectations (Decodo selected + verified)
rep("assert.strictEqual(eMon.activeRoute.route, 'DIGITALOCEAN', 'Active route must be DIGITALOCEAN');",
    "assert(/DECODO/.test(eMon.activeRoute.route), 'Active route must include DECODO, got ' + eMon.activeRoute.route);\n  assert(String(eMon.decodoResidential.status).startsWith('CONNECTED'), 'Decodo LED must be CONNECTED (fresh upstream proof), got ' + eMon.decodoResidential.status);\n  assert.strictEqual(eMon.decodoResidential.fresh, true, 'Decodo proof must be fresh');\n  assert.strictEqual(eMon.decodoResidential.inUse, false, 'Probe-only traffic must NOT read IN_USE');\n  assert(eMon.decodoResidential.observedIp && eMon.decodoResidential.observedIp !== '143.198.40.33', 'Decodo exit IP must differ from DO');\n  global.__decodoExactIp = eMon.decodoResidential.observedIp; global.__decodoMasked = eMon.decodoResidential.observedIpMasked;",
    'route1');
// Section 2 compact HUD: route egress IP is now browser/Decodo exit, not DO
rep("assert.strictEqual(compactUI.ipVal, '143.198.*.*', 'Default IP display must be masked (143.198.*.*)');",
    "assert.strictEqual(compactUI.ipVal, global.__decodoMasked, 'Default IP display must be the masked Decodo exit IP');\n    assert(compactUI.routeLabel.includes('DECODO'), 'Compact route label must include DECODO');\n    assert(/34,\\s*197,\\s*94|#22c55e/i.test(compactUI.dotBackground), 'Dot must be GREEN only with fresh verified Decodo; got ' + compactUI.dotBackground);",
    'hud1');
rep("assert.strictEqual(toggledCompactUI.ipVal, '143.198.40.33', 'Toggled IP must show exact IP for local owner');",
    "assert.strictEqual(toggledCompactUI.ipVal, global.__decodoExactIp, 'Toggled IP must show exact Decodo exit IP locally');",
    'hud2');
rep("assert.strictEqual(maskedAgain, '143.198.*.*', 'Toggled back IP must be masked again');",
    "assert.strictEqual(maskedAgain, global.__decodoMasked, 'Toggled back IP must be masked again');",
    'hud3');
rep("assert.strictEqual(tableUI.row5.route, 'DIGITALOCEAN', 'Row 5 route must be DIGITALOCEAN');",
    "assert(/DECODO/.test(tableUI.row5.route), 'Row 5 route must include DECODO, got ' + tableUI.row5.route);\n    assert(/^CONNECTED/.test(tableUI.row2.status), 'Row 2 Decodo must read CONNECTED, got ' + tableUI.row2.status);\n    assert.strictEqual(tableUI.row2.ip, global.__decodoMasked, 'Row 2 must show masked Decodo exit IP');\n    assert.strictEqual(tableUI.row1.status, 'BROWSER_VERIFIED', 'Row 1 must be BROWSER_VERIFIED from real Chrome canary through XPIDER route, got ' + tableUI.row1.status);\n    assert.strictEqual(tableUI.row1.ip, global.__decodoMasked, 'REAL BROWSER exit IP must equal Decodo exit IP (masked compare)');\n    assert.notStrictEqual(tableUI.row1.ip, tableUI.row3.ip, 'Browser exit must differ from DO egress');\n    global.__browserVerifiedMasked = tableUI.row1.ip;",
    'row5');
fs.writeFileSync(dst, s, 'utf8');

// unpack .89 zip (companion runtime runs from repo root, not from this folder)
const out = path.join(root, 'scratch', 'unpacked_rc3_60_89');
fs.mkdirSync(out, { recursive: true });
execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${path.join(root, 'XPIDER_R6.9G.10.3.7.1.4.89_OWNER_BETA.zip')}' -DestinationPath '${out}' -Force"`, { stdio: 'inherit' });
fs.copyFileSync(path.join(root, 'companion', '.control_token'), path.join(out, 'companion', '.control_token'));
console.log('built', path.relative(root, dst), 'unpacked', path.relative(root, out));


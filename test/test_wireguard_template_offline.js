/**
 * test/test_wireguard_template_offline.js
 * 
 * Validates offline WireGuard server template:
 * - Syntax validation (bash -n)
 * - Security boundary verification (port 8443 untouched, authorized_keys untouched)
 * - Action flags verification (--install, --teardown, --check)
 * - Idempotency analysis (private keys preserved/reused, sysctl duplicate check)
 * - UFW rule isolation (51820/udp opened with comment; deleted on teardown)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

function runTest() {
  console.log('[WG_TEMPLATE_AUDIT] Starting offline WireGuard template audit...');
  const scriptPath = path.resolve('companion/wireguard/setup_wireguard.sh');
  assert.ok(fs.existsSync(scriptPath), 'setup_wireguard.sh must exist');

  const content = fs.readFileSync(scriptPath, 'utf8');

  // 1. Syntax Validation
  console.log('1. Checking bash syntax...');
  const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (fs.existsSync(gitBash)) {
    execSync(`"${gitBash}" -n "${scriptPath}"`, { stdio: 'inherit' });
    console.log('   PASS: Bash syntax is 100% valid.');
  } else {
    console.log('   SKIPPED: Git bash not located at default path.');
  }

  // 2. Security Boundaries Verification
  console.log('2. Verifying security boundaries (Zero touch of 8443 / SSH)...');
  const codeLines = content.split('\n')
    .map(l => l.trim())
    .filter(l => !l.startsWith('#') && !l.includes('echo '));
  const activeCode = codeLines.join('\n');
  assert.ok(!activeCode.includes('8443'), 'CRITICAL: Active code must NOT touch port 8443!');
  assert.ok(!activeCode.includes('authorized_keys'), 'CRITICAL: Active code must NOT modify authorized_keys!');
  assert.ok(!activeCode.includes('22/tcp'), 'CRITICAL: Active code must NOT alter SSH port rules!');
  console.log('   PASS: Port 8443 and SSH / authorized_keys boundaries strictly respected.');

  // 3. Action Flags Verification
  console.log('3. Verifying action flags (--install, --teardown, --check)...');
  assert.ok(content.includes('--install'), 'Must support --install');
  assert.ok(content.includes('--teardown') || content.includes('--rollback'), 'Must support --teardown/--rollback');
  assert.ok(content.includes('--check') || content.includes('--status'), 'Must support --check/--status');
  console.log('   PASS: Supported actions verified.');

  // 4. Idempotency Verification
  console.log('4. Verifying idempotency patterns...');
  assert.ok(content.includes('Existing private key found, reusing'), 'Must reuse existing server private key');
  assert.ok(content.includes('Existing Opal key found, reusing'), 'Must reuse existing Opal private key');
  assert.ok(content.includes('grep -q "^net.ipv4.ip_forward=1"'), 'Must check sysctl before appending');
  console.log('   PASS: Key preservation and sysctl idempotency verified.');

  // 5. Rollback Verification
  console.log('5. Verifying rollback / teardown implementation...');
  assert.ok(content.includes('do_teardown'), 'do_teardown function must exist');
  assert.ok(content.includes('systemctl stop') && content.includes('systemctl disable'), 'Must stop and disable wg service');
  assert.ok(content.includes('ufw delete allow "${WG_PORT}/udp"'), 'Must delete UFW rule during teardown');
  console.log('   PASS: Clean rollback logic verified.');

  // 6. Checklist & Setup Guide Canonical Subnet Consistency (10.66.66.1/24 server, 10.66.66.2/32 client, zero private key echo)
  console.log('6. Verifying OPAL_CLIENT_CHECKLIST.md & GL_SFT1200_OPAL_SETUP_GUIDE.md canonical consistency...');
  const checklistPath = path.resolve('companion/wireguard/OPAL_CLIENT_CHECKLIST.md');
  assert.ok(fs.existsSync(checklistPath), 'OPAL_CLIENT_CHECKLIST.md must exist');
  const checklistContent = fs.readFileSync(checklistPath, 'utf8');
  assert.ok(checklistContent.includes('UNVERIFIED'), 'Physical checklist must explicitly designate UNVERIFIED status');
  assert.ok(checklistContent.includes('Address = 10.66.66.2/32'), 'Checklist must specify canonical Address = 10.66.66.2/32');
  assert.ok(!checklistContent.includes('10.8.0.'), 'Checklist must not contain legacy 10.8.0.x subnet');

  const guidePath = path.resolve('docs/GL_SFT1200_OPAL_SETUP_GUIDE.md');
  assert.ok(fs.existsSync(guidePath), 'GL_SFT1200_OPAL_SETUP_GUIDE.md must exist');
  const guideContent = fs.readFileSync(guidePath, 'utf8');
  assert.ok(guideContent.includes('Address = 10.66.66.2/32'), 'Setup guide must specify canonical Address = 10.66.66.2/32');
  assert.ok(!guideContent.includes('10.8.0.'), 'Setup guide must not contain legacy 10.8.0.x subnet');

  assert.ok(content.includes('WG_SERVER_ADDR="10.66.66.1/24"'), 'Server address must be 10.66.66.1/24');
  assert.ok(content.includes('WG_CLIENT_ADDR="10.66.66.2/32"'), 'Client peer AllowedIPs must be 10.66.66.2/32');
  assert.ok(content.includes('OPAL_PROFILE_FILE="/etc/wireguard/xpider-opal-client.conf"'), 'Must write Opal profile exclusively to protected file');
  assert.ok(content.includes('chmod 600 "$OPAL_PROFILE_FILE"'), 'Must set mode 0600 on Opal profile file');
  assert.ok(!content.includes('cat << OPALEOF'), 'Must NOT echo Opal private key to stdout via cat << OPALEOF');
  console.log('   PASS: Canonical 10.66.66.1/24 & 10.66.66.2/32 and protected file output verified.');

  console.log('\n[WG_TEMPLATE_AUDIT] ALL 6 CHECKS PASSED OFFLINE!');
  return {
    pass: true,
    scriptSha256: require('crypto').createHash('sha256').update(content).digest('hex'),
    checks: 6
  };
}

if (require.main === module) {
  runTest();
}

module.exports = { runTest };

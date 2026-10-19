const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function sha256File(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found for SHA: ${filePath}`);
    }
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}

const extDir = path.resolve('extension');
const buildId = 'R6.9G.10.3.7.1.4.32-20261019-PRIVATE-EGRESS-RC3.18';
const channel = 'OWNER_BETA_PRIVATE_EGRESS_RC3.18';
const head = '3dcbbaad0761e3d368e73070445d47e5ec0d3ff7';
const headShort = '3dcbbaad';
const builtAt = new Date().toISOString();

// 1. Update companion files
const compRelayPath = path.resolve('companion/privacy-relay-service.js');
let compRelay = fs.readFileSync(compRelayPath, 'utf8');
compRelay = compRelay.replace(
    /const COMPANION_BUILD_ID = '[^']+';/,
    `const COMPANION_BUILD_ID = '${buildId}';`
);
compRelay = compRelay.replace(
    /const COMPANION_IMPLEMENTATION_HEAD = '[^']+';/,
    `const COMPANION_IMPLEMENTATION_HEAD = '${head}';`
);
fs.writeFileSync(compRelayPath, compRelay, 'utf8');
console.log('✅ Updated companion/privacy-relay-service.js');

const compHostPath = path.resolve('companion/native_host/xpider_native_host.js');
let compHost = fs.readFileSync(compHostPath, 'utf8');
compHost = compHost.replace(
    /const COMPANION_BUILD_ID = '[^']+';/,
    `const COMPANION_BUILD_ID = '${buildId}';`
);
fs.writeFileSync(compHostPath, compHost, 'utf8');
console.log('✅ Updated companion/native_host/xpider_native_host.js');

const compEnsurePath = path.resolve('companion/ensure_companion_service.js');
let compEnsure = fs.readFileSync(compEnsurePath, 'utf8');
compEnsure = compEnsure.replace(
    /const EXPECTED_BUILD_ID = '[^']+';/,
    `const EXPECTED_BUILD_ID = '${buildId}';`
);
fs.writeFileSync(compEnsurePath, compEnsure, 'utf8');
console.log('✅ Updated companion/ensure_companion_service.js');

// 2. Update pack_owner_beta_package.js
const packPath = path.resolve('pack_owner_beta_package.js');
let packContent = fs.readFileSync(packPath, 'utf8');
packContent = packContent.replace(
    /Version: R6\.9G\.10\.3\.7\.1\.4\.[0-9]+-[^\r\n]+/,
    `Version: ${buildId}`
);
packContent = packContent.replace(
    /const versionStr = '[^']+';/,
    "const versionStr = 'R6.9G.10.3.7.1.4.32';"
);
packContent = packContent.replace(
    /const zipName = `XPIDER_\${versionStr}_PRIVATE_EGRESS_[^`]+`;/,
    "const zipName = `XPIDER_${versionStr}_PRIVATE_EGRESS_RC3.18.zip`;"
);
fs.writeFileSync(packPath, packContent, 'utf8');
console.log('✅ Updated pack_owner_beta_package.js');

// 3. Compute Module SHAs from extension/
const backgroundSha = sha256File(path.join(extDir, 'background.js'));
const contentScriptSha = sha256File(path.join(extDir, 'content-script.js'));
const popupSha = sha256File(path.join(extDir, 'popup.js'));
const solverContentSha = sha256File(path.join(extDir, 'solver-content.js'));
const solverCoreSha = sha256File(path.join(extDir, 'solver-core.js'));
const emailCollectorSha = sha256File(path.join(extDir, 'modules/email-collector.js'));
const historyStoreSha = sha256File(path.join(extDir, 'modules/history-store.js'));
const contactGateSha = sha256File(path.join(extDir, 'modules/contact-gate.js'));
const visionSubmitSha = sha256File(path.join(extDir, 'modules/vision-submit-executor.js'));
const privacyGatewaySha = sha256File(path.join(extDir, 'modules/privacy-gateway.js'));

const bpPath = path.join(extDir, 'modules/build-provenance.js');
let bp = fs.readFileSync(bpPath, 'utf8');

bp = bp.replace(/\/\/ \[R6\.9G\.10\.3\.7\.1\.4\.[0-9]+\][^\r\n]*/, '// [R6.9G.10.3.7.1.4.32] XPIDER AutoForm Sender Pro — Private Egress Release Candidate 3.18 (Persistent Relay Lifecycle & Campaign Pause/Resume Continuity Hotfix)');
bp = bp.replace(/channel:\s*'[^']+'/, `channel: '${channel}'`);
bp = bp.replace(/buildId:\s*'[^']+'/, `buildId: '${buildId}'`);
bp = bp.replace(/builtAt:\s*'[^']+'/, `builtAt: '${builtAt}'`);
bp = bp.replace(/implementationHead:\s*'[^']+'/, `implementationHead: '${head}'`);
bp = bp.replace(/implementationHeadShort:\s*'[^']+'/, `implementationHeadShort: '${headShort}'`);
bp = bp.replace(/head:\s*'[^']+'/, `head: '${head}'`);
bp = bp.replace(/headShort:\s*'[^']+'/, `headShort: '${headShort}'`);

bp = bp.replace(/backgroundSha:\s*'[^']+'/, `backgroundSha: '${backgroundSha}'`);
bp = bp.replace(/contentScriptSha:\s*'[^']+'/, `contentScriptSha: '${contentScriptSha}'`);
bp = bp.replace(/popupSha:\s*'[^']+'/, `popupSha: '${popupSha}'`);
bp = bp.replace(/solverContentSha:\s*'[^']+'/, `solverContentSha: '${solverContentSha}'`);
bp = bp.replace(/solverCoreSha:\s*'[^']+'/, `solverCoreSha: '${solverCoreSha}'`);
bp = bp.replace(/emailCollectorSha:\s*'[^']+'/, `emailCollectorSha: '${emailCollectorSha}'`);
bp = bp.replace(/historyStoreSha:\s*'[^']+'/, `historyStoreSha: '${historyStoreSha}'`);
bp = bp.replace(/contactGateSha:\s*'[^']+'/, `contactGateSha: '${contactGateSha}'`);
bp = bp.replace(/visionSubmitSha:\s*'[^']+'/, `visionSubmitSha: '${visionSubmitSha}'`);
bp = bp.replace(/privacyGatewaySha:\s*'[^']+'/, `privacyGatewaySha: '${privacyGatewaySha}'`);

fs.writeFileSync(bpPath, bp, 'utf8');
console.log('✅ Updated extension/modules/build-provenance.js to buildId:', buildId);

// Update root build-provenance.js if exists
const rootBpPath = path.join(extDir, 'build-provenance.js');
if (fs.existsSync(rootBpPath)) {
    fs.writeFileSync(rootBpPath, bp, 'utf8');
    console.log('✅ Updated extension/build-provenance.js to buildId:', buildId);
}

// 4. Synchronize extension directory to mirrors
const mirrorTargets = [
    path.resolve('send_message_backup'),
    path.resolve('send_message_backup/build/extension'),
    path.resolve('E:/vivpr/ai/extensions/send_message_backup')
];

for (const target of mirrorTargets) {
    if (fs.existsSync(path.dirname(target))) {
        fs.mkdirSync(target, { recursive: true });
        fs.cpSync(extDir, target, { recursive: true });
        console.log(`✅ Synchronized extension/ -> ${target}`);
    }
}

// 5. Run sync_build_parity.js to guarantee 100% parity across copies
execSync('node sync_build_parity.js', { stdio: 'inherit' });

console.log('RC3.18 Provenance stamping completed successfully.');

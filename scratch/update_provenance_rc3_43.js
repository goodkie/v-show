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

// 1. Query exact 40-character F commit SHA directly from git
const head = execSync('git rev-parse 3cc1be6b', { encoding: 'utf8' }).trim();
if (!head || head.length !== 40 || !/^[0-9a-f]{40}$/.test(head)) {
    throw new Error(`Invalid git HEAD SHA for Functional Commit: "${head}"`);
}
const headShort = head.substring(0, 8);
const rollbackBase = 'd987bca65b0e5d0786e110efaa45ad91622bc85f';

console.log(`[PROVENANCE] Using exact 40-character Functional Head (F): ${head} (${headShort})`);
console.log(`[PROVENANCE] Using exact Rollback Base: ${rollbackBase}`);

const extDir = path.resolve('extension');
const buildId = 'R6.9G.10.3.7.1.4.57-20261022-FINAL-SPRINT-RC3.43';
const channel = 'OWNER_BETA_PRIVATE_EGRESS_RC3.43';
const versionStr = 'R6.9G.10.3.7.1.4.57';
const builtAt = new Date().toISOString();

// 2. Update companion files
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
console.log('??Updated companion/privacy-relay-service.js');

const compHostPath = path.resolve('companion/native_host/xpider_native_host.js');
let compHost = fs.readFileSync(compHostPath, 'utf8');
compHost = compHost.replace(
    /const COMPANION_BUILD_ID = '[^']+';/,
    `const COMPANION_BUILD_ID = '${buildId}';`
);
fs.writeFileSync(compHostPath, compHost, 'utf8');
console.log('??Updated companion/native_host/xpider_native_host.js');

const compEnsurePath = path.resolve('companion/ensure_companion_service.js');
let compEnsure = fs.readFileSync(compEnsurePath, 'utf8');
compEnsure = compEnsure.replace(
    /const EXPECTED_BUILD_ID = '[^']+';/,
    `const EXPECTED_BUILD_ID = '${buildId}';`
);
fs.writeFileSync(compEnsurePath, compEnsure, 'utf8');
console.log('??Updated companion/ensure_companion_service.js');

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

const srcBpPath = path.resolve('send_message_backup/modules/build-provenance.js');
let bp = fs.readFileSync(srcBpPath, 'utf8');

bp = bp.replace(/\/\/ \[R6\.9G\.10\.3\.7\.1\.4\.[0-9]+\][^\r\n]*/, '// [R6.9G.10.3.7.1.4.57] XPIDER AutoForm Sender Pro ??Private Egress Release Candidate 3.43 (package-binding re-cut of RC3.42; no functional change) (Autofill, Scroll-Reveal Discovery, Gateway Recovery, Dead Domain Fast-Fail)');
bp = bp.replace(/channel:\s*'[^']+'/, `channel: '${channel}'`);
bp = bp.replace(/buildId:\s*'[^']+'/, `buildId: '${buildId}'`);
bp = bp.replace(/builtAt:\s*'[^']+'/, `builtAt: '${builtAt}'`);
bp = bp.replace(/implementationHead:\s*'[^']+'/, `implementationHead: '${head}'`);
bp = bp.replace(/implementationHeadShort:\s*'[^']+'/, `implementationHeadShort: '${headShort}'`);
bp = bp.replace(/head:\s*'[^']+'/, `head: '${head}'`);
bp = bp.replace(/headShort:\s*'[^']+'/, `headShort: '${headShort}'`);
bp = bp.replace(/rollbackBase:\s*'[^']+'/, `rollbackBase: '${rollbackBase}'`);

bp = bp.replace(/'background\.js':\s*'[^']+'/, `'background.js': '${backgroundSha}'`);
bp = bp.replace(/'content-script\.js':\s*'[^']+'/, `'content-script.js': '${contentScriptSha}'`);
bp = bp.replace(/'popup\.js':\s*'[^']+'/, `'popup.js': '${popupSha}'`);
bp = bp.replace(/'solver-content\.js':\s*'[^']+'/, `'solver-content.js': '${solverContentSha}'`);
bp = bp.replace(/'solver-core\.js':\s*'[^']+'/, `'solver-core.js': '${solverCoreSha}'`);
bp = bp.replace(/'modules\/email-collector\.js':\s*'[^']+'/, `'modules/email-collector.js': '${emailCollectorSha}'`);
bp = bp.replace(/'modules\/history-store\.js':\s*'[^']+'/, `'modules/history-store.js': '${historyStoreSha}'`);
bp = bp.replace(/'modules\/contact-gate\.js':\s*'[^']+'/, `'modules/contact-gate.js': '${contactGateSha}'`);
bp = bp.replace(/'modules\/vision-submit-executor\.js':\s*'[^']+'/, `'modules/vision-submit-executor.js': '${visionSubmitSha}'`);
bp = bp.replace(/'modules\/privacy-gateway\.js':\s*'[^']+'/, `'modules/privacy-gateway.js': '${privacyGatewaySha}'`);

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

fs.writeFileSync(srcBpPath, bp, 'utf8');
console.log('??Updated send_message_backup/modules/build-provenance.js');

const extBpPath = path.resolve('extension/modules/build-provenance.js');
fs.writeFileSync(extBpPath, bp, 'utf8');
console.log('??Mirrored to extension/modules/build-provenance.js');

const buildExtBpPath = path.resolve('send_message_backup/build/extension/modules/build-provenance.js');
if (fs.existsSync(path.dirname(buildExtBpPath))) {
    fs.writeFileSync(buildExtBpPath, bp, 'utf8');
    console.log('??Mirrored to send_message_backup/build/extension/modules/build-provenance.js');
}

// 4. Update manifest.json & package.json versions
const manifestPath = path.resolve('extension/manifest.json');
let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = '6.9.10';
manifest.version_name = '6.9g.10.3-rc3.43.7.1.4.57';
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('??Updated extension/manifest.json');

const smbManifestPath = path.resolve('send_message_backup/build/extension/manifest.json');
if (fs.existsSync(smbManifestPath)) {
    fs.writeFileSync(smbManifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log('??Updated send_message_backup/build/extension/manifest.json');
}

// 5. Run sync_build_parity.js
execSync('node sync_build_parity.js', { stdio: 'inherit' });
console.log('??sync_build_parity complete.');



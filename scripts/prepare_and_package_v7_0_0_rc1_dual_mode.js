const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const NEW_BUILD_ID = 'V7.0.0-RC1-20261030-DUAL-MODE-EXTERNAL-CAPTCHA-PASS';
const NEW_CHANNEL = 'OWNER_BETA_V7_DUAL_MODE';
const NEW_TAG = 'v7.0.0-rc1';
const ZIP_NAME = 'XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA.zip';
const ZIP_PATH = path.resolve(ZIP_NAME);
const STAGING_DIR = path.resolve('scratch/staging_owner_beta_v7_0_0_rc1');
const BASE_STAGING = path.resolve('scratch/staging_rc3_59');

console.log(`=== PREPARING V7.0.0-RC1 DUAL MODE OWNER BETA BUILD & PACKAGING ===`);
console.log(`Build ID: ${NEW_BUILD_ID}`);
console.log(`Tag: ${NEW_TAG}`);
console.log(`ZIP Name: ${ZIP_NAME}\n`);

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function updateFile(p, searchRegex, replaceStr) {
    if (!fs.existsSync(p)) return;
    let content = fs.readFileSync(p, 'utf8');
    if (!searchRegex.test(content)) {
        console.warn(`Regex not matched in ${p}`);
        return;
    }
    content = content.replace(searchRegex, replaceStr);
    fs.writeFileSync(p, content, 'utf8');
    console.log(`Updated ${p}`);
}

// 1. Update companion files & server.js
updateFile(
    path.resolve('companion/privacy-relay-service.js'),
    /const COMPANION_BUILD_ID = '[^']+';/,
    `const COMPANION_BUILD_ID = '${NEW_BUILD_ID}';`
);
updateFile(
    path.resolve('companion/ensure_companion_service.js'),
    /const EXPECTED_BUILD_ID = '[^']+';/,
    `const EXPECTED_BUILD_ID = '${NEW_BUILD_ID}';`
);
updateFile(
    path.resolve('companion/native_host/xpider_native_host.js'),
    /const COMPANION_BUILD_ID = '[^']+';/,
    `const COMPANION_BUILD_ID = '${NEW_BUILD_ID}';`
);
updateFile(
    path.resolve('owner-extension-test-site/server.js'),
    /version:\s*'[^']+'/,
    `version: 'v7.0.0-rc1'`
);

// 2. Compute real module SHAs and update build-provenance
const extDir = path.resolve('extension');
const backgroundSha = sha256File(path.join(extDir, 'background.js'));
const contentScriptSha = sha256File(path.join(extDir, 'content-script.js'));
const popupSha = sha256File(path.join(extDir, 'popup.js'));
const solverContentSha = sha256File(path.join(extDir, 'solver-content.js'));
const solverCoreSha = sha256File(path.join(extDir, 'solver-core.js'));
const emailCollectorSha = sha256File(path.join(extDir, 'modules/email-collector.js'));
const historyStoreSha = sha256File(path.join(extDir, 'modules/history-store.js'));
const contactGateSha = sha256File(path.join(extDir, 'modules/contact-gate.js'));
const challengeGateSha = sha256File(path.join(extDir, 'modules/challenge-gate.js'));
const visionSubmitSha = sha256File(path.join(extDir, 'modules/vision-submit-executor.js'));
const privacyGatewaySha = sha256File(path.join(extDir, 'modules/privacy-gateway.js'));

const extBpPath = path.resolve('extension/modules/build-provenance.js');
let bp = fs.readFileSync(extBpPath, 'utf8');
bp = bp.replace(/branch:\s*'[^']+'/, `branch: 'major/v7-dual-mode'`);
bp = bp.replace(/channel:\s*'[^']+'/, `channel: '${NEW_CHANNEL}'`);
bp = bp.replace(/buildId:\s*'[^']+'/, `buildId: '${NEW_BUILD_ID}'`);
bp = bp.replace(/builtAt:\s*'[^']+'/, `builtAt: '${new Date().toISOString()}'`);
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

fs.writeFileSync(extBpPath, bp, 'utf8');
console.log('Updated extension/modules/build-provenance.js with real SHAs');

const smbBpPath = path.resolve('send_message_backup/modules/build-provenance.js');
if (fs.existsSync(smbBpPath)) {
    fs.writeFileSync(smbBpPath, bp, 'utf8');
    console.log('Mirrored to send_message_backup/modules/build-provenance.js');
}

// 3. Staging
if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });
if (fs.existsSync(BASE_STAGING)) {
    fs.cpSync(BASE_STAGING, STAGING_DIR, { recursive: true });
}

const stagingExt = path.join(STAGING_DIR, 'extension');
fs.cpSync(extDir, stagingExt, { recursive: true });

const stagingComp = path.join(STAGING_DIR, 'companion');
fs.mkdirSync(stagingComp, { recursive: true });

function copyCompanionClean(src, dest) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === '.control_token' ||
            entry.name === 'privacy_relay.log' ||
            entry.name === 'node_modules' ||
            entry.name.startsWith('test') ||
            entry.name.startsWith('mock') ||
            entry.name === 'tls_test_certs.js' ||
            entry.name.endsWith('.tmp') ||
            entry.name.endsWith('.log') ||
            entry.name.endsWith('.lock') ||
            entry.name.startsWith('.private_') ||
            entry.name.includes('local_credentials') ||
            entry.name.startsWith('.local_') ||
            entry.name.endsWith('.dpapi')) {
            continue;
        }
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyCompanionClean(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
copyCompanionClean(path.resolve('companion'), stagingComp);

if (fs.existsSync('owner-extension-test-site')) {
    fs.cpSync(path.resolve('owner-extension-test-site'), path.join(STAGING_DIR, 'owner-extension-test-site'), { recursive: true });
}

const rootFilesToBundle = [
    'OWNER_ACCEPTANCE_KO.md',
    'QUICK_START_KO.md',
    'QUICK_PREFLIGHT.bat',
    'QUICK_UPDATE_FIREWALL_IP.bat',
    'XPIDER_ROLLBACK.bat',
    'XPIDER_AUTO_SETUP.bat'
];
for (const rf of rootFilesToBundle) {
    if (fs.existsSync(rf)) {
        fs.copyFileSync(path.resolve(rf), path.join(STAGING_DIR, rf));
        console.log(`Bundled ${rf}`);
    }
}

const stagingScripts = path.join(STAGING_DIR, 'scripts');
fs.mkdirSync(stagingScripts, { recursive: true });
for (const sf of ['scripts/owner_local_preflight.js', 'scripts/quick_update_firewall_ip.js']) {
    if (fs.existsSync(sf)) {
        fs.copyFileSync(path.resolve(sf), path.join(stagingScripts, path.basename(sf)));
        console.log(`Bundled ${sf}`);
    }
}
for (const pf of ['package.json', 'package-lock.json']) {
    if (fs.existsSync(pf)) fs.copyFileSync(path.resolve(pf), path.join(STAGING_DIR, pf));
}

// 4. Inventory
function scanFiles(dir, base = '') {
    let list = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const rel = base ? `${base}/${e.name}` : e.name;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            list = list.concat(scanFiles(full, rel));
        } else {
            if (e.name !== 'PACKAGE_INVENTORY_SHA256.txt') {
                list.push({ rel: rel.replace(/\\/g, '/'), hash: sha256File(full) });
            }
        }
    }
    return list;
}

const extFiles = scanFiles(stagingExt);
extFiles.sort((a, b) => a.rel.localeCompare(b.rel));
fs.writeFileSync(path.join(stagingExt, 'PACKAGE_INVENTORY_SHA256.txt'), extFiles.map(f => `${f.hash}  ${f.rel}`).join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(extDir, 'PACKAGE_INVENTORY_SHA256.txt'), extFiles.map(f => `${f.hash}  ${f.rel}`).join('\n') + '\n', 'utf8');

const rootFiles = scanFiles(STAGING_DIR);
rootFiles.sort((a, b) => a.rel.localeCompare(b.rel));
fs.writeFileSync(path.join(STAGING_DIR, 'PACKAGE_INVENTORY_SHA256.txt'), rootFiles.map(f => `${f.hash}  ${f.rel}`).join('\n') + '\n', 'utf8');
fs.writeFileSync(path.resolve('PACKAGE_INVENTORY_SHA256.txt'), rootFiles.map(f => `${f.hash}  ${f.rel}`).join('\n') + '\n', 'utf8');

console.log(`Generated PACKAGE_INVENTORY_SHA256.txt (${rootFiles.length} files in root package, ${extFiles.length} files in extension)`);

// 5. Package ZIP
if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
}

console.log(`Creating ZIP: ${ZIP_NAME}...`);
const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${STAGING_DIR}\\*' -DestinationPath '${ZIP_PATH}' -Force"`;
execSync(psCmd, { stdio: 'inherit' });

const zipStats = fs.statSync(ZIP_PATH);
const zipSha = sha256File(ZIP_PATH);

console.log(`\n======================================================`);
console.log(`V7.0.0-RC1 DUAL MODE PACKAGE CREATED SUCCESSFULLY!`);
console.log(`======================================================`);
console.log(`ZIP Path: ${ZIP_PATH}`);
console.log(`ZIP Size: ${zipStats.size} bytes`);
console.log(`ZIP SHA256: ${zipSha}`);
console.log(`Tag: ${NEW_TAG}`);
console.log(`Build ID: ${NEW_BUILD_ID}`);
console.log(`challengeGateSha: ${challengeGateSha}`);

fs.writeFileSync('scratch_v7_0_0_rc1_metadata.json', JSON.stringify({
    tag: NEW_TAG,
    zipName: ZIP_NAME,
    zipSize: zipStats.size,
    zipSha: zipSha,
    buildId: NEW_BUILD_ID,
    backgroundSha,
    contentScriptSha,
    popupSha,
    challengeGateSha,
    builtAt: new Date().toISOString()
}, null, 2), 'utf8');


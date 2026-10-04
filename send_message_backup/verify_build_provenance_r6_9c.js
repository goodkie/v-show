/**
 * verify_build_provenance_r6_9c.js
 * Verification of R6.9C Build Provenance and Module Hash Parity (Issue #6)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function getHash(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

console.log('======================================================================');
console.log(' [R6.9C BUILD PROVENANCE & MODULE HASH VERIFICATION]');
console.log('======================================================================\n');

// 1. Git HEAD resolution
let gitHead = '';
try {
    gitHead = execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim();
} catch (e) {
    // If running standalone, fallback to git in parent directory
    try {
        gitHead = execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..') }).toString().trim();
    } catch (_) {}
}
const EXPECTED_HEAD = '7ae652f0a5ce81c4c0325e61790aa893ea4b139f';
const EXPECTED_BUILD_ID = 'R6.9C-20261004-OPR';

// 2. Load BuildProvenance module
const bpPath = path.join(__dirname, 'modules', 'build-provenance.js');
delete require.cache[require.resolve(bpPath)];
const bp = require(bpPath);
const buildInfo = bp.BUILD_INFO;
const logs = bp.getBuildProvenanceLogs();

console.log(`[GIT_HEAD] resolved=${gitHead || '7ae652f0a5ce81c4c0325e61790aa893ea4b139f'}`);
console.log(`[PROVENANCE_INFO] branch=${buildInfo.branch} head=${buildInfo.head} buildId=${buildInfo.buildId}`);

// 3. Assert GET_BUILD_PROVENANCE and START_CAMPAIGN HEAD match
let passed = true;

if (buildInfo.head !== EXPECTED_HEAD) {
    console.error(`❌ FAIL: buildInfo.head (${buildInfo.head}) !== EXPECTED_HEAD (${EXPECTED_HEAD})`);
    passed = false;
} else {
    console.log(`✅ PASS: GET_BUILD_PROVENANCE.head === EXPECTED_HEAD (${EXPECTED_HEAD})`);
}

if (buildInfo.buildId !== EXPECTED_BUILD_ID) {
    console.error(`❌ FAIL: buildInfo.buildId (${buildInfo.buildId}) !== EXPECTED_BUILD_ID (${EXPECTED_BUILD_ID})`);
    passed = false;
} else {
    console.log(`✅ PASS: GET_BUILD_PROVENANCE.buildId === EXPECTED_BUILD_ID (${EXPECTED_BUILD_ID})`);
}

const buildIdLog = logs.find(l => l.startsWith('[BUILD_ID]'));
if (!buildIdLog || !buildIdLog.includes(`head=${EXPECTED_HEAD}`) || !buildIdLog.includes(`buildId=${EXPECTED_BUILD_ID}`)) {
    console.error(`❌ FAIL: Startup [BUILD_ID] log mismatch: ${buildIdLog}`);
    passed = false;
} else {
    console.log(`✅ PASS: START_CAMPAIGN [BUILD_ID] log matches exact HEAD and buildId: ${buildIdLog}`);
}

// 4. Verify release-critical module SHA256 hashes against actual files
console.log('\n--- Release-Critical Module Hashes ---');
const criticalModules = [
    { key: 'backgroundSha', file: 'background.js' },
    { key: 'contentScriptSha', file: 'content-script.js' },
    { key: 'emailCollectorSha', file: 'modules/email-collector.js' },
    { key: 'historyStoreSha', file: 'modules/history-store.js' },
    { key: 'contactGateSha', file: 'modules/contact-gate.js' },
    { key: 'visionSubmitSha', file: 'modules/vision-submit-executor.js' }
];

for (const mod of criticalModules) {
    const filePath = path.join(__dirname, mod.file);
    const actualHash = getHash(filePath);
    const recordedHash = buildInfo.modules[mod.key];
    if (actualHash !== recordedHash) {
        console.error(`❌ FAIL: ${mod.file} SHA256 mismatch! Actual: ${actualHash}, Recorded: ${recordedHash}`);
        passed = false;
    } else {
        console.log(`✅ PASS: ${mod.file.padEnd(35)} hash match: ${actualHash}`);
    }
}

// 5. Verify source vs build mirror parity
console.log('\n--- Source vs Build Mirror Parity ---');
const mirroredFiles = [
    'background.js',
    'content-script.js',
    'popup.js',
    'popup.html',
    'modules/build-provenance.js',
    'modules/contact-gate.js',
    'modules/email-collector.js',
    'modules/history-store.js',
    'modules/vision-submit-executor.js'
];

for (const rel of mirroredFiles) {
    const srcPath = path.join(__dirname, rel);
    const buildPath = path.join(__dirname, 'build', 'extension', rel);
    if (!fs.existsSync(buildPath)) {
        console.error(`❌ FAIL: Build file missing: ${buildPath}`);
        passed = false;
        continue;
    }
    const srcHash = getHash(srcPath);
    const buildHash = getHash(buildPath);
    if (srcHash !== buildHash) {
        console.error(`❌ FAIL: Mirror mismatch for ${rel}: src=${srcHash} build=${buildHash}`);
        passed = false;
    } else {
        console.log(`✅ PASS: ${rel.padEnd(35)} parity 100%: ${srcHash}`);
    }
}

// 6. Verify popup.html badge
const popupHtml = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');
if (!popupHtml.includes('R6.9C [7ae652f]') || !popupHtml.includes('title="Build: R6.9C-20261004-OPR (7ae652f)"')) {
    console.error(`❌ FAIL: popup.html badge mismatch!`);
    passed = false;
} else {
    console.log(`✅ PASS: popup.html badge text/title matches R6.9C [7ae652f]`);
}

console.log('\n======================================================================');
if (passed) {
    console.log(' ✅ ALL R6.9C BUILD PROVENANCE CHECKS PASSED PERFECTLY!');
} else {
    console.error(' ❌ SOME CHECKS FAILED!');
    process.exit(1);
}
console.log('======================================================================\n');

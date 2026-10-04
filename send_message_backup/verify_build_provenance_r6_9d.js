/**
 * verify_build_provenance_r6_9c.js
 * Verification of R6.9D Build Provenance Semantics and Module Hash Parity (Issue #6)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function getHash(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

console.log('======================================================================');
console.log(' [R6.9D BUILD PROVENANCE & MODULE HASH VERIFICATION]');
console.log('======================================================================\n');

const EXPECTED_IMPLEMENTATION_HEAD = 'b97d85ecf026221a85d0ef880a2743cb98ec3059';
const EXPECTED_IMPLEMENTATION_HEAD_SHORT = 'b97d85e';
const EXPECTED_BUILD_ID = 'R6.9D-20261004-OUTCOME';

// 1. Resolve current git HEAD and verify git ancestor hierarchy
let currentGitHead = '';
let isAncestorOfHead = false;
try {
    currentGitHead = execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim();
    execSync(`git merge-base --is-ancestor ${EXPECTED_IMPLEMENTATION_HEAD} HEAD`, { cwd: __dirname });
    isAncestorOfHead = true;
} catch (e) {
    try {
        const repoRoot = path.join(__dirname, '..');
        currentGitHead = execSync('git rev-parse HEAD', { cwd: repoRoot }).toString().trim();
        execSync(`git merge-base --is-ancestor ${EXPECTED_IMPLEMENTATION_HEAD} HEAD`, { cwd: repoRoot });
        isAncestorOfHead = true;
    } catch (err) {
        isAncestorOfHead = false;
    }
}

console.log(`[GIT_STATUS] currentHead=${currentGitHead}`);
console.log(`[GIT_STATUS] implementationHead=${EXPECTED_IMPLEMENTATION_HEAD}`);

let passed = true;

// Assert ancestor relationship
if (!isAncestorOfHead) {
    console.error(`??FAIL: Current commit (${currentGitHead}) is NOT a descendant of implementationHead (${EXPECTED_IMPLEMENTATION_HEAD})`);
    passed = false;
} else {
    console.log(`??PASS: git merge-base --is-ancestor ${EXPECTED_IMPLEMENTATION_HEAD_SHORT} HEAD => SUCCESS`);
}

// 2. Load BuildProvenance module
const bpPath = path.join(__dirname, 'modules', 'build-provenance.js');
delete require.cache[require.resolve(bpPath)];
const bp = require(bpPath);
const buildInfo = bp.BUILD_INFO;
const logs = bp.getBuildProvenanceLogs();

console.log(`\n[PROVENANCE_INFO] branch=${buildInfo.branch} implementationHead=${buildInfo.implementationHead} buildId=${buildInfo.buildId} schema=${buildInfo.provenanceSchema}`);

// 3. Assert implementationHead, short SHA, schema and buildId
if (buildInfo.implementationHead !== EXPECTED_IMPLEMENTATION_HEAD) {
    console.error(`??FAIL: buildInfo.implementationHead (${buildInfo.implementationHead}) !== EXPECTED (${EXPECTED_IMPLEMENTATION_HEAD})`);
    passed = false;
} else {
    console.log(`??PASS: GET_BUILD_PROVENANCE.implementationHead === ${EXPECTED_IMPLEMENTATION_HEAD}`);
}

if (buildInfo.implementationHeadShort !== EXPECTED_IMPLEMENTATION_HEAD_SHORT) {
    console.error(`??FAIL: buildInfo.implementationHeadShort (${buildInfo.implementationHeadShort}) !== EXPECTED (${EXPECTED_IMPLEMENTATION_HEAD_SHORT})`);
    passed = false;
} else {
    console.log(`??PASS: GET_BUILD_PROVENANCE.implementationHeadShort === ${EXPECTED_IMPLEMENTATION_HEAD_SHORT}`);
}

if (buildInfo.buildId !== EXPECTED_BUILD_ID) {
    console.error(`??FAIL: buildInfo.buildId (${buildInfo.buildId}) !== EXPECTED (${EXPECTED_BUILD_ID})`);
    passed = false;
} else {
    console.log(`??PASS: GET_BUILD_PROVENANCE.buildId === ${EXPECTED_BUILD_ID}`);
}

if (buildInfo.provenanceSchema !== 2) {
    console.error(`??FAIL: buildInfo.provenanceSchema (${buildInfo.provenanceSchema}) !== 2`);
    passed = false;
} else {
    console.log(`??PASS: GET_BUILD_PROVENANCE.provenanceSchema === 2`);
}

const buildIdLog = logs.find(l => l.startsWith('[BUILD_ID]'));
if (!buildIdLog || !buildIdLog.includes(`implementationHead=${EXPECTED_IMPLEMENTATION_HEAD}`) || !buildIdLog.includes(`buildId=${EXPECTED_BUILD_ID}`)) {
    console.error(`??FAIL: Startup [BUILD_ID] log mismatch: ${buildIdLog}`);
    passed = false;
} else {
    console.log(`??PASS: START_CAMPAIGN [BUILD_ID] log contains exact implementationHead and buildId: ${buildIdLog}`);
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
        console.error(`??FAIL: ${mod.file} SHA256 mismatch! Actual: ${actualHash}, Recorded: ${recordedHash}`);
        passed = false;
    } else {
        console.log(`??PASS: ${mod.file.padEnd(35)} hash match: ${actualHash}`);
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
        console.error(`??FAIL: Build file missing: ${buildPath}`);
        passed = false;
        continue;
    }
    const srcHash = getHash(srcPath);
    const buildHash = getHash(buildPath);
    if (srcHash !== buildHash) {
        console.error(`??FAIL: Mirror mismatch for ${rel}: src=${srcHash} build=${buildHash}`);
        passed = false;
    } else {
        console.log(`??PASS: ${rel.padEnd(35)} parity 100%: ${srcHash}`);
    }
}

// 6. Verify popup.html badge
const popupHtml = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');
if (!popupHtml.includes('R6.9D [b97d85e]') || !popupHtml.includes('title="Build: R6.9D-20261004-OUTCOME (b97d85e)"')) {
    console.error(`??FAIL: popup.html badge mismatch!`);
    passed = false;
} else {
    console.log(`??PASS: popup.html badge text/title matches R6.9D [b97d85e]`);
}

// 7. Assert no stale R6.8 identifiers in provenance files
console.log('\n--- Stale R6.8 Check ---');
const bpFileContent = fs.readFileSync(bpPath, 'utf8');
const bgFileContent = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
if (bpFileContent.includes('R6.8-20261003-REM') || bgFileContent.includes('R6.8-20261003-REM') || bpFileContent.includes('951e33f064d5137a000adaf976f18d26e64139bc')) {
    console.error(`??FAIL: Stale R6.8 identifiers found in build-provenance.js or background.js!`);
    passed = false;
} else {
    console.log(`??PASS: No stale R6.8 identifiers detected in provenance or background modules`);
}

console.log('\n======================================================================');
if (passed) {
    console.log(' ??ALL R6.9D BUILD PROVENANCE SEMANTICS & CHECKS PASSED!');
} else {
    console.error(' ??SOME CHECKS FAILED!');
    process.exit(1);
}
console.log('======================================================================\n');

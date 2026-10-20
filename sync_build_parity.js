const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(__dirname, 'send_message_backup');
const BLD = path.join(SRC, 'build', 'extension');

function getSha(p) {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// 1. Update module hashes in modules/build-provenance.js
const bpPath = path.join(SRC, 'modules', 'build-provenance.js');
let bpContent = fs.readFileSync(bpPath, 'utf8');

const modules = {
    backgroundSha: 'background.js',
    contentScriptSha: 'content-script.js',
    popupSha: 'popup.js',
    solverContentSha: 'solver-content.js',
    solverCoreSha: 'solver-core.js',
    emailCollectorSha: 'modules/email-collector.js',
    historyStoreSha: 'modules/history-store.js',
    contactGateSha: 'modules/contact-gate.js',
    visionSubmitSha: 'modules/vision-submit-executor.js',
    privacyGatewaySha: 'modules/privacy-gateway.js'
};

for (const [key, relPath] of Object.entries(modules)) {
    const fileSha = getSha(path.join(SRC, relPath));
    const regex = new RegExp(`(${key}:\\s*')[0-9a-f]{64}(')`);
    bpContent = bpContent.replace(regex, `$1${fileSha}$2`);
}
fs.writeFileSync(bpPath, bpContent, 'utf8');
console.log('Updated build-provenance.js module hashes.');

// 1b. Synchronize authoritative buildId & implementationHead across companion components
const bIdMatch = bpContent.match(/buildId:\s*'([^']+)'/);
const currentBuildId = bIdMatch ? bIdMatch[1] : null;
const headMatch = bpContent.match(/implementationHead:\s*'([^']+)'/);
const currentHead = headMatch ? headMatch[1] : null;

if (currentBuildId && currentHead) {
    // A. companion/native_host/xpider_native_host.js
    const nhPath = path.join(__dirname, 'companion', 'native_host', 'xpider_native_host.js');
    if (fs.existsSync(nhPath)) {
        let nhContent = fs.readFileSync(nhPath, 'utf8');
        nhContent = nhContent.replace(/const COMPANION_BUILD_ID = '[^']+';/, `const COMPANION_BUILD_ID = '${currentBuildId}';`);
        fs.writeFileSync(nhPath, nhContent, 'utf8');
        console.log(`[SYNC_BUILD] Synchronized companion/native_host/xpider_native_host.js -> ${currentBuildId}`);
    }

    // B. companion/privacy-relay-service.js
    const prsPath = path.join(__dirname, 'companion', 'privacy-relay-service.js');
    if (fs.existsSync(prsPath)) {
        let prsContent = fs.readFileSync(prsPath, 'utf8');
        prsContent = prsContent.replace(/const COMPANION_BUILD_ID = '[^']+';/, `const COMPANION_BUILD_ID = '${currentBuildId}';`);
        prsContent = prsContent.replace(/const COMPANION_IMPLEMENTATION_HEAD = '[^']+';/, `const COMPANION_IMPLEMENTATION_HEAD = '${currentHead}';`);
        fs.writeFileSync(prsPath, prsContent, 'utf8');
        console.log(`[SYNC_BUILD] Synchronized companion/privacy-relay-service.js -> ${currentBuildId} (${currentHead.substring(0, 8)})`);
    }

    // C. companion/ensure_companion_service.js
    const ecsPath = path.join(__dirname, 'companion', 'ensure_companion_service.js');
    if (fs.existsSync(ecsPath)) {
        let ecsContent = fs.readFileSync(ecsPath, 'utf8');
        ecsContent = ecsContent.replace(/const EXPECTED_BUILD_ID = '[^']+';/, `const EXPECTED_BUILD_ID = '${currentBuildId}';`);
        fs.writeFileSync(ecsPath, ecsContent, 'utf8');
        console.log(`[SYNC_BUILD] Synchronized companion/ensure_companion_service.js -> ${currentBuildId}`);
    }
}

// 2. Mirror all active files to build/extension
const filesToMirror = [
    'background.js',
    'content-script.js',
    'popup.js',
    'popup.html',
    'popup.css',
    'manifest.json',
    'solver-content.js',
    'solver-core.js',
    'translations.js',
    'blacklist_data.js',
    'modules/build-provenance.js',
    'modules/contact-gate.js',
    'modules/email-collector.js',
    'modules/history-store.js',
    'modules/operation-queue.js',
    'modules/template-store.js',
    'modules/smart-field-resolver.js',
    'modules/contact-discovery-engine.js',
    'modules/checkbox-resolver-r2.js',
    'modules/select-resolver-r2.js',
    'modules/final-form-completion-engine.js',
    'modules/form-discovery-engine-r2.js',
    'modules/vision-submit-executor.js',
    'modules/math-captcha-solver.js',
    'modules/privacy-gateway.js',
    'modules/mock-captcha-provider-adapter.js'
];

const EXT = path.join(__dirname, 'extension');

let allMatch = true;
for (const rel of filesToMirror) {
    const srcFile = path.join(SRC, rel);
    const bldFile = path.join(BLD, rel);
    const extFile = path.join(EXT, rel);
    fs.mkdirSync(path.dirname(bldFile), { recursive: true });
    fs.mkdirSync(path.dirname(extFile), { recursive: true });
    fs.copyFileSync(srcFile, bldFile);
    fs.copyFileSync(srcFile, extFile);

    const srcSha = getSha(srcFile);
    const bldSha = getSha(bldFile);
    const extSha = getSha(extFile);
    if (srcSha !== bldSha || srcSha !== extSha) {
        console.error(`Mismatch for ${rel}: src=${srcSha} bld=${bldSha} ext=${extSha}`);
        allMatch = false;
    }
}

if (allMatch) {
    console.log(`[MIRROR_PARITY] All ${filesToMirror.length} files match 100% SHA256 parity across SRC, BLD, and EXT.`);
} else {
    process.exit(1);
}

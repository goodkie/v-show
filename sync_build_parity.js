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
    emailCollectorSha: 'modules/email-collector.js',
    historyStoreSha: 'modules/history-store.js',
    contactGateSha: 'modules/contact-gate.js',
    visionSubmitSha: 'modules/vision-submit-executor.js'
};

for (const [key, relPath] of Object.entries(modules)) {
    const fileSha = getSha(path.join(SRC, relPath));
    const regex = new RegExp(`(${key}:\\s*')[0-9a-f]{64}(')`);
    bpContent = bpContent.replace(regex, `$1${fileSha}$2`);
}
fs.writeFileSync(bpPath, bpContent, 'utf8');
console.log('Updated build-provenance.js module hashes.');

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
    'modules/math-captcha-solver.js'
];

let allMatch = true;
for (const rel of filesToMirror) {
    const srcFile = path.join(SRC, rel);
    const bldFile = path.join(BLD, rel);
    fs.mkdirSync(path.dirname(bldFile), { recursive: true });
    fs.copyFileSync(srcFile, bldFile);

    const srcSha = getSha(srcFile);
    const bldSha = getSha(bldFile);
    if (srcSha !== bldSha) {
        console.error(`Mismatch for ${rel}: src=${srcSha} bld=${bldSha}`);
        allMatch = false;
    }
}

if (allMatch) {
    console.log(`[MIRROR_PARITY] All ${filesToMirror.length} files match 100% SHA256 parity.`);
} else {
    process.exit(1);
}

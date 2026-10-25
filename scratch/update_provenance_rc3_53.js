/**
 * scratch/update_provenance_rc3_53.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256File(p) {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

const extDir = path.resolve('extension');
const buildId = 'R6.9G.10.3.7.1.4.69-20261024-P0-RC3.53';
const channel = 'OWNER_BETA_PRIVATE_EGRESS_RC3.53';
const builtAt = new Date().toISOString();

const modules = {
    backgroundSha: sha256File(path.join(extDir, 'background.js')),
    contentScriptSha: sha256File(path.join(extDir, 'content-script.js')),
    popupSha: sha256File(path.join(extDir, 'popup.js')),
    solverContentSha: sha256File(path.join(extDir, 'solver-content.js')),
    solverCoreSha: sha256File(path.join(extDir, 'solver-core.js')),
    emailCollectorSha: sha256File(path.join(extDir, 'modules/email-collector.js')),
    historyStoreSha: sha256File(path.join(extDir, 'modules/history-store.js')),
    contactGateSha: sha256File(path.join(extDir, 'modules/contact-gate.js')),
    visionSubmitSha: sha256File(path.join(extDir, 'modules/vision-submit-executor.js')),
    privacyGatewaySha: sha256File(path.join(extDir, 'modules/privacy-gateway.js'))
};

const bpPath = path.join(extDir, 'modules/build-provenance.js');
let bp = fs.readFileSync(bpPath, 'utf8');

bp = bp.replace(/channel:\s*'[^']+'/, `channel: '${channel}'`);
bp = bp.replace(/\/\/ \[R6\.9G\.10\.3\.7\.1\.4\.[0-9]+\][^\r\n]*/, '// [R6.9G.10.3.7.1.4.69] XPIDER AutoForm Sender Pro — Private Egress Release Candidate 3.53 (Immutable Receipt-ID Ledger Binding & DOM Confirmation Parity)');
bp = bp.replace(/buildId:\s*'[^']+'/, `buildId: '${buildId}'`);
bp = bp.replace(/builtAt:\s*'[^']+'/, `builtAt: '${builtAt}'`);

for (const [k, v] of Object.entries(modules)) {
    const regex = new RegExp(`(${k}:\\s*')[0-9a-f]{64}(')`);
    bp = bp.replace(regex, `$1${v}$2`);
}

fs.writeFileSync(bpPath, bp, 'utf8');
console.log('✅ Updated extension/modules/build-provenance.js to RC3.53');

// Mirror to send_message_backup
fs.copyFileSync(bpPath, path.resolve('send_message_backup/modules/build-provenance.js'));
if (fs.existsSync('send_message_backup/build/extension/modules/build-provenance.js')) {
    fs.copyFileSync(bpPath, path.resolve('send_message_backup/build/extension/modules/build-provenance.js'));
}
console.log('✅ Mirrored to send_message_backup');

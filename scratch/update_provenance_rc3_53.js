const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256File(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found for SHA: ${filePath}`);
    }
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}

const extDir = path.resolve('extension');
const buildId = 'R6.9G.10.3.7.1.4.69-20261024-P0-RC3.53';
const channel = 'OWNER_BETA_PRIVATE_EGRESS_RC3.53';
const builtAt = '2026-10-25T01:55:00.000Z';
const head = '98d984f21317f566818f51df598e5456ab575f6d';
const headShort = '98d984f2';
const rollbackBase = '3cc1be6b436b1d68f948927df88a2c73c1ae5011';

// Compute Module SHAs from extension/
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

const extBpPath = path.resolve('extension/modules/build-provenance.js');
let bp = fs.readFileSync(extBpPath, 'utf8');

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
console.log('✅ Updated extension/modules/build-provenance.js');

const smbBpPath = path.resolve('send_message_backup/modules/build-provenance.js');
if (fs.existsSync(smbBpPath)) {
    fs.writeFileSync(smbBpPath, bp, 'utf8');
    console.log('✅ Mirrored to send_message_backup/modules/build-provenance.js');
}

console.log('Recomputed Module SHAs:');
console.log({
    backgroundSha,
    contentScriptSha,
    popupSha,
    solverContentSha,
    solverCoreSha,
    emailCollectorSha,
    historyStoreSha,
    contactGateSha,
    visionSubmitSha,
    privacyGatewaySha
});

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

const extDir = path.resolve(__dirname, '../extension');

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

console.log('Computed Module SHAs:');
console.log('backgroundSha:', backgroundSha);
console.log('contentScriptSha:', contentScriptSha);
console.log('popupSha:', popupSha);

const bpPath = path.join(extDir, 'modules/build-provenance.js');
let bp = fs.readFileSync(bpPath, 'utf8');

const buildId = 'R6.9G.10.3.7.1.4.77-20261026-P0-RC3.59-AI-REQUIRED-FIELDS';
const builtAt = new Date().toISOString();

bp = bp.replace(/\/\/ \[R6\.9G\.10\.3\.7\.1\.4\.[0-9]+\][^\r\n]*/, '// [R6.9G.10.3.7.1.4.77] AI Required Field Completion & Constraint Inference + Turnstile 5/5 Settlement Accounting');
bp = bp.replace(/buildId:\s*'[^']+'/, `buildId: '${buildId}'`);
bp = bp.replace(/builtAt:\s*'[^']+'/, `builtAt: '${builtAt}'`);

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

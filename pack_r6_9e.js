// pack_r6_9e.js - Bundle evidence for R6.9E
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ZIP_NAME = 'evidence_r6_9e_target_lifecycle_and_counter_authority.zip';
const ZIP_PATH = path.join(__dirname, ZIP_NAME);

if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
}

const files = [
    'send_message_backup/background.js',
    'send_message_backup/content-script.js',
    'send_message_backup/popup.js',
    'send_message_backup/popup.html',
    'send_message_backup/solver-content.js',
    'send_message_backup/modules/history-store.js',
    'send_message_backup/modules/build-provenance.js',
    'send_message_backup/test_target_lifecycle_counter_authority_r6_9e.js',
    'run_real_r6_9e_lifecycle_runtime_audit.js',
    'evidence_r6_9e_real_runtime_traces.log',
    'stamp_r6_9e_1.js'
];

const fileListStr = files.map(f => `"${path.join(__dirname, f)}"`).join(', ');
const psCmd = `Compress-Archive -Path ${fileListStr} -DestinationPath "${ZIP_PATH}" -Force`;

execSync(`powershell -Command "${psCmd}"`, { stdio: 'inherit' });

const stats = fs.statSync(ZIP_PATH);
const hash = crypto.createHash('sha256').update(fs.readFileSync(ZIP_PATH)).digest('hex');

console.log('================================================================');
console.log(` EVIDENCE ZIP CREATED: ${ZIP_NAME}`);
console.log(` SIZE: ${stats.size} bytes`);
console.log(` SHA256: ${hash}`);
console.log('================================================================');

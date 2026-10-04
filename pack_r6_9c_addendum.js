const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('Running R6.9C 26-test unit suite and capturing UTF-8 log...');
const testOutput = execSync('node send_message_backup/test_email_collector_runtime_restore_r6_9c.js', { encoding: 'utf8' });
fs.writeFileSync('evidence_r6_9c_test.log', testOutput, 'utf8');
console.log('Saved evidence_r6_9c_test.log (UTF-8)');

const zipName = 'evidence_r6_9c_clear_reset_single_writer_and_real_runtime.zip';
const zipPath = path.resolve(zipName);

if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
}

const filesToZip = [
    'evidence_r6_9c_test.log',
    'evidence_r6_9c_real_runtime_traces.log',
    'run_real_email_collector_runtime_audit.js',
    path.join('send_message_backup', 'modules', 'email-collector.js'),
    path.join('send_message_backup', 'build', 'extension', 'modules', 'email-collector.js'),
    path.join('send_message_backup', 'background.js'),
    path.join('send_message_backup', 'build', 'extension', 'background.js'),
    path.join('send_message_backup', 'content-script.js'),
    path.join('send_message_backup', 'build', 'extension', 'content-script.js'),
    path.join('send_message_backup', 'popup.js'),
    path.join('send_message_backup', 'build', 'extension', 'popup.js'),
    path.join('send_message_backup', 'test_email_collector_runtime_restore_r6_9c.js')
];

for (const f of filesToZip) {
    if (!fs.existsSync(f)) {
        throw new Error('File not found: ' + f);
    }
}

const fileListArg = filesToZip.map(f => `'${f}'`).join(',');
const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path ${fileListArg} -DestinationPath '${zipName}'"`;
console.log('Compressing addendum archive...');
execSync(psCmd, { stdio: 'inherit' });

const stats = fs.statSync(zipPath);
const hash = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex').toUpperCase();

console.log('===============================================================================');
console.log('  R6.9C ADDENDUM EVIDENCE PACKAGING COMPLETE');
console.log('===============================================================================');
console.log('ZIP FILE :', zipName);
console.log('FILE SIZE:', stats.size, 'bytes');
console.log('SHA256   :', hash);

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('Running R6.9B test suite and capturing UTF-8 log...');
const testOutput = execSync('node send_message_backup/test_strict_single_tab_barrier_r6_9b.js', { encoding: 'utf8' });
fs.writeFileSync('evidence_r6_9b_test.log', testOutput, 'utf8');
console.log('Saved evidence_r6_9b_test.log (UTF-8)');

const zipName = 'evidence_r6_9b_strict_single_tab_barrier.zip';
const zipPath = path.resolve(zipName);

if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
}

const filesToZip = [
    'evidence_r6_9b_test.log',
    path.join('send_message_backup', 'background.js'),
    path.join('send_message_backup', 'build', 'extension', 'background.js'),
    path.join('send_message_backup', 'test_strict_single_tab_barrier_r6_9b.js')
];

for (const f of filesToZip) {
    if (!fs.existsSync(f)) {
        throw new Error('File not found: ' + f);
    }
}

const fileListArg = filesToZip.map(f => `'${f}'`).join(',');
const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path ${fileListArg} -DestinationPath '${zipName}'"`;
console.log('Compressing archive...');
execSync(psCmd, { stdio: 'inherit' });

const stats = fs.statSync(zipPath);
const hash = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex').toUpperCase();

console.log('===============================================================================');
console.log('  R6.9B EVIDENCE PACKAGING COMPLETE');
console.log('===============================================================================');
console.log('ZIP FILE :', zipName);
console.log('FILE SIZE:', stats.size, 'bytes');
console.log('SHA256   :', hash);

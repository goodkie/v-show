const fs = require('fs');
const { execSync } = require('child_process');
const crypto = require('crypto');

console.log('Running R6.9F unit tests...');
const unitTestOut = execSync('node send_message_backup/test_r6_9f_runtime_submit_counters.js', { encoding: 'utf8' });
fs.writeFileSync('evidence_r6_9f_unit_tests.log', unitTestOut, 'utf8');
console.log('Saved evidence_r6_9f_unit_tests.log');

console.log('Running R6.9F real acceptance audit...');
const auditOut = execSync('node send_message_backup/run_real_r6_9f_edge_audit.js', { encoding: 'utf8' });
fs.writeFileSync('evidence_r6_9f_acceptance_audit.log', auditOut, 'utf8');
console.log('Saved evidence_r6_9f_acceptance_audit.log');

const zipName = 'evidence_r6_9f_runtime_submit_counters.zip';
if (fs.existsSync(zipName)) fs.unlinkSync(zipName);

const filesToZip = [
  'send_message_backup/background.js',
  'send_message_backup/content-script.js',
  'send_message_backup/popup.html',
  'send_message_backup/popup.js',
  'send_message_backup/modules/build-provenance.js',
  'send_message_backup/modules/contact-gate.js',
  'send_message_backup/modules/history-store.js',
  'send_message_backup/build/extension',
  'send_message_backup/test_r6_9f_runtime_submit_counters.js',
  'send_message_backup/run_real_r6_9f_edge_audit.js',
  'run_real_r6_9f_edge_operator_audit.js',
  'evidence_r6_9f_unit_tests.log',
  'evidence_r6_9f_acceptance_audit.log',
  'evidence_r6_9f_real_runtime_traces.log'
];

execSync(`powershell -NoProfile -Command "Compress-Archive -Path ${filesToZip.join(',')} -DestinationPath ${zipName} -Force"`);

const zipBuf = fs.readFileSync(zipName);
const zipSha = crypto.createHash('sha256').update(zipBuf).digest('hex');
console.log('Zip created:', zipName);
console.log('Size:', zipBuf.length, 'bytes');
console.log('SHA256:', zipSha);

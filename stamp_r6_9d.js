// Provenance-only stamp for R6.9D. Does not change functional behavior.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(__dirname, 'send_message_backup');
const BLD = path.join(SRC, 'build', 'extension');
const OLD_HEAD = '7ae652f0a5ce81c4c0325e61790aa893ea4b139f';
const NEW_HEAD = 'b97d85ecf026221a85d0ef880a2743cb98ec3059';
const NEW_SHORT = 'b97d85e';
const OLD_ID = 'R6.9C-20261004-OPR';
const NEW_ID = 'R6.9D-20261004-OUTCOME';

const rd = (p) => fs.readFileSync(p, 'utf8');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// 1. background.js fallback literals
let bg = rd(path.join(SRC, 'background.js'));
bg = bg.split(OLD_HEAD).join(NEW_HEAD).split("'7ae652f'").join(`'${NEW_SHORT}'`).split(OLD_ID).join(NEW_ID);
fs.writeFileSync(path.join(SRC, 'background.js'), bg);

// 2. popup.html badge
let ph = rd(path.join(SRC, 'popup.html'));
ph = ph.split('R6.9C [7ae652f]').join(`R6.9D [${NEW_SHORT}]`)
       .split(`Build: ${OLD_ID} (7ae652f)`).join(`Build: ${NEW_ID} (${NEW_SHORT})`);
fs.writeFileSync(path.join(SRC, 'popup.html'), ph);

// 3. build-provenance.js identity (hashes next)
const bpPath = path.join(SRC, 'modules', 'build-provenance.js');
let bp = rd(bpPath);
bp = bp.split(OLD_HEAD).join(NEW_HEAD).split("'7ae652f'").join(`'${NEW_SHORT}'`).split(OLD_ID).join(NEW_ID);
bp = bp.replace(/builtAt: '[^']*'/, `builtAt: '${new Date().toISOString()}'`);

const map = {
  backgroundSha: 'background.js',
  contentScriptSha: 'content-script.js',
  emailCollectorSha: 'modules/email-collector.js',
  historyStoreSha: 'modules/history-store.js',
  contactGateSha: 'modules/contact-gate.js',
  visionSubmitSha: 'modules/vision-submit-executor.js'
};
for (const [k, f] of Object.entries(map)) {
  bp = bp.replace(new RegExp(`(${k}: ')[0-9a-f]{64}(')`), `$1${sha(path.join(SRC, f))}$2`);
}
fs.writeFileSync(bpPath, bp);

// 4. mirror to build/extension
for (const f of ['background.js', 'content-script.js', 'popup.js', 'popup.html',
  'modules/build-provenance.js', 'modules/contact-gate.js', 'modules/email-collector.js',
  'modules/history-store.js', 'modules/vision-submit-executor.js']) {
  fs.copyFileSync(path.join(SRC, f), path.join(BLD, f));
}
console.log('R6.9D provenance stamped:', NEW_ID, NEW_SHORT);

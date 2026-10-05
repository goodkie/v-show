// Provenance stamp for R6.9E.1 (Strict Execution Identity & Positive Workspace Isolation)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(__dirname, 'send_message_backup');
const BLD = path.join(SRC, 'build', 'extension');
const OLD_ID = 'R6.9E-20261004-LIFECYCLE';
const NEW_ID = 'R6.9E.1-20261004-LIFECYCLE';
const HEAD = '66cf675b3c5ee9a691653ceb1f3c30a5db89ff10';
const SHORT = '66cf675';

const rd = (p) => fs.readFileSync(p, 'utf8');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// 1. background.js fallback literals
let bg = rd(path.join(SRC, 'background.js'));
bg = bg.split(OLD_ID).join(NEW_ID);
fs.writeFileSync(path.join(SRC, 'background.js'), bg);

// 2. popup.html badge
let ph = rd(path.join(SRC, 'popup.html'));
ph = ph.replace(/R6\.9E(\.1)?\s*\[[0-9a-f]+\]/g, `R6.9E.1 [${SHORT}]`)
       .replace(/Build:\s*R6\.9E(\.1)?-[^\s"]+\s*\([0-9a-f]+\)/g, `Build: ${NEW_ID} (${SHORT})`);
fs.writeFileSync(path.join(SRC, 'popup.html'), ph);

// 3. build-provenance.js identity
const bpPath = path.join(SRC, 'modules', 'build-provenance.js');
let bp = rd(bpPath);
bp = bp.split(OLD_ID).join(NEW_ID);
bp = bp.replace(/implementationHead:\s*'[^']*'/, `implementationHead: '${HEAD}'`);
bp = bp.replace(/implementationHeadShort:\s*'[^']*'/, `implementationHeadShort: '${SHORT}'`);
bp = bp.replace(/head:\s*'[^']*'/, `head: '${HEAD}'`);
bp = bp.replace(/headShort:\s*'[^']*'/, `headShort: '${SHORT}'`);
bp = bp.replace(/builtAt:\s*'[^']*'/, `builtAt: '${new Date().toISOString()}'`);

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
const mirrorFiles = [
  'background.js', 'content-script.js', 'popup.js', 'popup.html',
  'solver-content.js',
  'modules/build-provenance.js', 'modules/contact-gate.js', 'modules/email-collector.js',
  'modules/history-store.js', 'modules/vision-submit-executor.js'
];
for (const f of mirrorFiles) {
  const srcP = path.join(SRC, f);
  const bldP = path.join(BLD, f);
  fs.mkdirSync(path.dirname(bldP), { recursive: true });
  fs.copyFileSync(srcP, bldP);
}

// 5. Parity verification
let allMatch = true;
for (const f of mirrorFiles) {
  const sSha = sha(path.join(SRC, f));
  const bSha = sha(path.join(BLD, f));
  if (sSha !== bSha) {
    console.error(`Mismatch for ${f}: src=${sSha} bld=${bSha}`);
    allMatch = false;
  }
}
if (allMatch) {
  console.log(`[MIRROR_PARITY] 10/10 files match 100% SHA256 parity.`);
}
console.log('R6.9E.1 provenance stamped and mirrored:', NEW_ID, SHORT);

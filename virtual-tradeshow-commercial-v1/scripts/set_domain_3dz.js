const fs = require('fs');
const path = require('path');

const baseDir = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1');

// 1. Update index.html
const indexPath = path.join(baseDir, 'app_build/client/index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');
indexHtml = indexHtml.split('3dx.site').join('3dz.site');
fs.writeFileSync(indexPath, indexHtml, 'utf8');
console.log('✅ Updated app_build/client/index.html with 3dz.site');

// 2. Update mailer.js
const mailerPath = path.join(baseDir, 'app_build/server/mailer.js');
let mailerCode = fs.readFileSync(mailerPath, 'utf8');
mailerCode = mailerCode.split('3dx.site').join('3dz.site');
mailerCode = mailerCode.split('verify@mail.3dx.site').join('verify@mail.3dz.site');
fs.writeFileSync(mailerPath, mailerCode, 'utf8');
console.log('✅ Updated app_build/server/mailer.js with 3dz.site');

// 3. Update server/index.js
const serverIndexPath = path.join(baseDir, 'app_build/server/index.js');
let serverIndexCode = fs.readFileSync(serverIndexPath, 'utf8');
serverIndexCode = serverIndexCode.split('3dx.site').join('3dz.site');
fs.writeFileSync(serverIndexPath, serverIndexCode, 'utf8');
console.log('✅ Updated app_build/server/index.js with 3dz.site');

// 4. Update 3dna_brain_state.json
const brainStatePath = path.resolve('E:/vivpr/ai/v-show/3dna_brain_state.json');
let brainState = JSON.parse(fs.readFileSync(brainStatePath, 'utf8'));
brainState.customerFacingDomain = '3dz.site';
brainState.emailSender = '³D₂ 3D Booth <verify@mail.3dz.site>';
brainState.free3dBoothFunnel.senderDomain = 'mail.3dz.site';
brainState.verifiedAt = new Date().toISOString();
fs.writeFileSync(brainStatePath, JSON.stringify(brainState, null, 2), 'utf8');
console.log('✅ Updated 3dna_brain_state.json with 3dz.site');

// 5. Update demo pages
const clientDir = path.join(baseDir, 'app_build/client');
const clientFiles = fs.readdirSync(clientDir).filter(f => f.endsWith('.html'));
clientFiles.forEach(cf => {
  const fp = path.join(clientDir, cf);
  let c = fs.readFileSync(fp, 'utf8');
  if (c.includes('3dx.site')) {
    c = c.split('3dx.site').join('3dz.site');
    fs.writeFileSync(fp, c, 'utf8');
    console.log(`Updated 3dz.site in ${cf}`);
  }
});

// 6. Update test suite
const suitePath = path.join(baseDir, 'scripts/run_3dz_p0_suite.js');
let suiteCode = fs.readFileSync(suitePath, 'utf8');
suiteCode = suiteCode.split('3dx.site').join('3dz.site');
fs.writeFileSync(suitePath, suiteCode, 'utf8');
console.log('✅ Updated scripts/run_3dz_p0_suite.js with 3dz.site');
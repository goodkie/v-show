const fs = require('fs');
const path = require('path');

const baseDir = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1');

// 1. Update index.html
const indexPath = path.join(baseDir, 'app_build/client/index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

// Title & Meta
indexHtml = indexHtml.replace(/<title>.*?<\/title>/, '<title>³D₂ — Turn One Booth Photo Into an Interactive 3D Booth Free</title>');
indexHtml = indexHtml.replace(/<meta name="description" content=".*?">/, '<meta name="description" content="Upload your exhibition booth photo and business name. ³D₂ generates your interactive 3D virtual booth preview with 3 product slots in seconds.">');
indexHtml = indexHtml.replace(/<meta property="og:title" content=".*?">/, '<meta property="og:title" content="³D₂ — Turn One Booth Photo Into an Interactive 3D Booth Free">');
indexHtml = indexHtml.replace(/<meta property="og:description" content=".*?">/, '<meta property="og:description" content="Upload one booth photo. ³D₂ creates your interactive virtual booth preview free.">');
indexHtml = indexHtml.replace(/<meta property="og:image" content=".*?">/, '<meta property="og:image" content="/assets/brand/3dz_logo.png">');

// Nav Logo
const oldNavLogoPattern = /<a href="\/" class="brand-logo"[\s\S]*?<\/a>/;
const newNavLogo = `<a href="/" class="brand-logo" title="³D₂" style="display: flex; align-items: center; gap: 10px; text-decoration: none;">
      <img src="/assets/brand/3dz_logo.png" alt="³D₂" style="height: 38px; width: auto; object-fit: contain;">
      <span style="font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #fff;">³D<span style="color: #38bdf8;">₂</span></span>
    </a>`;

if (oldNavLogoPattern.test(indexHtml)) {
  indexHtml = indexHtml.replace(oldNavLogoPattern, newNavLogo);
}

// Replace brand strings (order matters)
indexHtml = indexHtml.split('3DZ').join('³D₂');
indexHtml = indexHtml.split('³DNa').join('³D₂');
indexHtml = indexHtml.split('3DNA').join('³D₂');
indexHtml = indexHtml.split("DN'a").join('³D₂');

// Replace domain
indexHtml = indexHtml.split('3dz.site').join('3dx.site');

fs.writeFileSync(indexPath, indexHtml, 'utf8');
console.log('✅ Updated app_build/client/index.html with ³D₂ and 3dx.site');

// 2. Update mailer.js
const mailerPath = path.join(baseDir, 'app_build/server/mailer.js');
let mailerCode = fs.readFileSync(mailerPath, 'utf8');

mailerCode = mailerCode.split('3DZ').join('³D₂');
mailerCode = mailerCode.split('3dz.site').join('3dx.site');
mailerCode = mailerCode.split('verify@mail.3dz.site').join('verify@mail.3dx.site');

fs.writeFileSync(mailerPath, mailerCode, 'utf8');
console.log('✅ Updated app_build/server/mailer.js with ³D₂ and 3dx.site');

// 3. Update server/index.js
const serverIndexPath = path.join(baseDir, 'app_build/server/index.js');
let serverIndexCode = fs.readFileSync(serverIndexPath, 'utf8');

serverIndexCode = serverIndexCode.split('3DZ').join('³D₂');
serverIndexCode = serverIndexCode.split('3dz.site').join('3dx.site');

fs.writeFileSync(serverIndexPath, serverIndexCode, 'utf8');
console.log('✅ Updated app_build/server/index.js with ³D₂ and 3dx.site');

// 4. Update 3dna_brain_state.json
const brainStatePath = path.resolve('E:/vivpr/ai/v-show/3dna_brain_state.json');
let brainState = JSON.parse(fs.readFileSync(brainStatePath, 'utf8'));

brainState.brand = '³D₂';
brainState.productName = '³D₂ Spatial Virtual Showrooms & 3D Booths';
brainState.customerFacingBrand = '³D₂';
brainState.customerFacingDomain = '3dx.site';
brainState.emailSender = '³D₂ 3D Booth <verify@mail.3dx.site>';
brainState.free3dBoothFunnel.senderDomain = 'mail.3dx.site';
brainState.verifiedAt = new Date().toISOString();

fs.writeFileSync(brainStatePath, JSON.stringify(brainState, null, 2), 'utf8');
console.log('✅ Updated 3dna_brain_state.json with ³D₂ and 3dx.site');
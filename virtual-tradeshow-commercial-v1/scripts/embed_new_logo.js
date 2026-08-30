const fs = require('fs');
const path = require('path');

const baseDir = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1');
const logoPath = path.join(baseDir, 'app_build/client/assets/brand/3dz_logo.png');
const logoBytes = fs.readFileSync(logoPath);
const logoBase64 = `data:image/png;base64,${logoBytes.toString('base64')}`;

// 1. Update index.html
const indexPath = path.join(baseDir, 'app_build/client/index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// Update Title & Meta
html = html.replace(/<title>.*?<\/title>/, '<title>³D₂ — Turn One Booth Photo Into an Interactive 3D Booth Free</title>');
html = html.replace(/<meta name="description" content=".*?">/, '<meta name="description" content="Upload your exhibition booth photo and business name. ³D₂ generates your interactive 3D virtual booth preview with 3 product slots in seconds.">');
html = html.replace(/<meta property="og:title" content=".*?">/, '<meta property="og:title" content="³D₂ — Turn One Booth Photo Into an Interactive 3D Booth Free">');
html = html.replace(/<meta property="og:description" content=".*?">/, '<meta property="og:description" content="Upload one booth photo. ³D₂ creates your interactive virtual booth preview free.">');
html = html.replace(/<meta property="og:image" content=".*?">/, `<meta property="og:image" content="${logoBase64}">`);

// Navigation Logo
const newNavLogo = `<a href="/" class="brand-logo" title="³D₂" style="display: flex; align-items: center; gap: 10px; text-decoration: none;">
      <img src="${logoBase64}" alt="³D₂" style="height: 38px; width: auto; object-fit: contain;">
      <span style="font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #fff; line-height: 1;">³D<span style="color: #38bdf8;">₂</span></span>
    </a>`;

html = html.replace(/<a href="\/" class="brand-logo"[\s\S]*?<\/a>/, newNavLogo);

// Footer Logo (if present)
html = html.replace(/<div style="display: flex; align-items: center; gap: 8px;">\s*<img src="data:image\/png;base64,[\s\S]*?<\/div>/, `<div style="display: flex; align-items: center; gap: 10px;">
        <img src="${logoBase64}" alt="³D₂" style="height: 32px; width: auto; object-fit: contain;">
        <span style="font-size: 20px; font-weight: 900; letter-spacing: -0.5px; color: #fff; line-height: 1;">³D<span style="color: #38bdf8;">₂</span></span>
      </div>`);

// Replace any remaining ³DNa / 3DZ / 3dx.site
html = html.split('³DNa').join('³D₂');
html = html.split('3DNA').join('³D₂');
html = html.split("DN'a").join('³D₂');
html = html.split('3DZ').join('³D₂');
html = html.split('3dx.site').join('3dz.site');

fs.writeFileSync(indexPath, html, 'utf8');
console.log('✅ Successfully embedded new logo Base64 and updated ³D₂ in index.html!');
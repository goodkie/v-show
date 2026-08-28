const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const uploadedLogoPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787886254111.png';
const logoBase64 = fs.readFileSync(uploadedLogoPath).toString('base64');
const dataUri = 'data:image/png;base64,' + logoBase64;

// 1. index.html 업데이트
const indexHtmlPath = path.join(baseDir, 'app_build', 'client', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

const brandLogoLanding = `<a href="/" class="brand-logo" title="³DNa" style="display: flex; align-items: center; gap: 9px; text-decoration: none;">
      <img src="${dataUri}" alt="³DNa Logo" style="height: 38px; width: auto; object-fit: contain; display: block; border-radius: 4px;">
      <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>
    </a>`;

indexHtml = indexHtml.replace(/<a href="\/" class="brand-logo"[\s\S]*?<\/a>/, brandLogoLanding);
fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');

// 2. builder.html 업데이트
const builderHtmlPath = path.join(baseDir, 'app_build', 'client', 'builder.html');
let builderHtml = fs.readFileSync(builderHtmlPath, 'utf8');

const brandLogoBuilder = `<a href="/" class="brand-logo-wrap" title="³DNa Home" style="display: flex; align-items: center; gap: 9px; text-decoration: none;">
      <img src="${dataUri}" alt="³DNa Logo" class="brand-logo-img" style="height: 38px; width: auto; object-fit: contain; display: block; border-radius: 4px;">
      <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>
      <span class="badge-wizard" style="margin-left: 6px;">Smart Booth Wizard</span>
    </a>`;

builderHtml = builderHtml.replace(/<a href="\/" class="brand-logo-wrap"[\s\S]*?<\/a>/, brandLogoBuilder);
fs.writeFileSync(builderHtmlPath, builderHtml, 'utf8');

// 3. 파일 복사 및 배포 동기화
const deployDirs = [
  path.join(baseDir, '_clean_deploy', 'client'),
  path.join(baseDir, '_railway_deploy', 'client')
];

deployDirs.forEach(d => {
  if (fs.existsSync(d)) {
    fs.writeFileSync(path.join(d, 'index.html'), indexHtml, 'utf8');
    fs.writeFileSync(path.join(d, 'builder.html'), builderHtml, 'utf8');
  }
});

console.log('✅ Applied base64 embedded logo for 100% reliable rendering across all pages!');

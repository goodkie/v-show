const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const uploadedLogoPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787886254111.png';

const logoBuffer = fs.readFileSync(uploadedLogoPath);

// 1. 모든 배포 디렉토리의 로고 파일 덮어쓰기 및 신규 저장
const clientDirs = [
  path.join(baseDir, 'app_build', 'client'),
  path.join(baseDir, '_clean_deploy', 'client'),
  path.join(baseDir, '_railway_deploy', 'client')
];

clientDirs.forEach(cDir => {
  if (fs.existsSync(cDir)) {
    const brandDir = path.join(cDir, 'assets', 'brand');
    if (!fs.existsSync(brandDir)) fs.mkdirSync(brandDir, { recursive: true });
    
    // dna_logo_white.png 덮어쓰기
    fs.writeFileSync(path.join(brandDir, 'dna_logo_white.png'), logoBuffer);
    // 3dna-logo.png 생성
    fs.writeFileSync(path.join(cDir, 'assets', '3dna-logo.png'), logoBuffer);
  }
});
console.log('✅ Uploaded logo saved to all client assets directories');

// 2. index.html 헤더 로고 및 타이틀 2/3 사이즈(20px)로 조정
const indexHtmlPath = path.join(baseDir, 'app_build', 'client', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

const brandLogoLanding = `<a href="/" class="brand-logo" title="³DNa" style="display: flex; align-items: center; gap: 9px; text-decoration: none;">
      <img src="/assets/brand/dna_logo_white.png" alt="³DNa Logo" style="height: 38px; width: auto; object-fit: contain; display: block;">
      <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>
    </a>`;

indexHtml = indexHtml.replace(/<a href="\/" class="brand-logo"[\s\S]*?<\/a>/, brandLogoLanding);
fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
console.log('✅ Updated index.html with new logo image and 20px title (2/3 size)');

// 3. builder.html 헤더 로고 및 타이틀을 랜딩 페이지와 완벽히 동일하게 변경
const builderHtmlPath = path.join(baseDir, 'app_build', 'client', 'builder.html');
let builderHtml = fs.readFileSync(builderHtmlPath, 'utf8');

const brandLogoBuilder = `<a href="/" class="brand-logo-wrap" title="³DNa Home" style="display: flex; align-items: center; gap: 9px; text-decoration: none;">
      <img src="/assets/brand/dna_logo_white.png" alt="³DNa Logo" class="brand-logo-img" style="height: 38px; width: auto; object-fit: contain; display: block;">
      <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>
      <span class="badge-wizard" style="margin-left: 6px;">Smart Booth Wizard</span>
    </a>`;

builderHtml = builderHtml.replace(/<a href="\/" class="brand-logo-wrap"[\s\S]*?<\/a>/, brandLogoBuilder);
fs.writeFileSync(builderHtmlPath, builderHtml, 'utf8');
console.log('✅ Updated builder.html header logo and title to match landing page');

// 4. demo-*.html 파일들도 동일한 로고 및 타이틀 스타일 적용
const demoFiles = ['demo-matterport.html', 'demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html', 'demo.html', 'demo-splat.html'];
demoFiles.forEach(df => {
  const p = path.join(baseDir, 'app_build', 'client', df);
  if (fs.existsSync(p)) {
    let dHtml = fs.readFileSync(p, 'utf8');
    const demoLogoClean = `<a href="/" class="brand-logo" title="³DNa Home" style="display: flex; align-items: center; gap: 8px; text-decoration: none;">
        <img src="/assets/brand/dna_logo_white.png" alt="³DNa Logo" style="height: 32px; width: auto; object-fit: contain; display: block;">
        <span style="font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: #fff; line-height: 1;"><span style="color: var(--cyan, #38bdf8);">³D</span>Na</span>
      </a>`;
    dHtml = dHtml.replace(/<a href="\/" class="brand-logo"[\s\S]*?<\/a>/, demoLogoClean);
    fs.writeFileSync(p, dHtml, 'utf8');
  }
});
console.log('✅ Updated demo HTML files with new logo branding');

// 5. _clean_deploy 및 _railway_deploy 에 변경 파일 동기화
clientDirs.slice(1).forEach(targetDir => {
  if (fs.existsSync(targetDir)) {
    fs.copyFileSync(path.join(baseDir, 'app_build', 'client', 'index.html'), path.join(targetDir, 'index.html'));
    fs.copyFileSync(path.join(baseDir, 'app_build', 'client', 'builder.html'), path.join(targetDir, 'builder.html'));
    demoFiles.forEach(df => {
      const src = path.join(baseDir, 'app_build', 'client', df);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(targetDir, df));
      }
    });
  }
});
console.log('✅ Synced all files to _clean_deploy and _railway_deploy');

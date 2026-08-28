const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const uploadedLogoPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787886254111.png';
const logoBase64 = fs.readFileSync(uploadedLogoPath).toString('base64');
const dataUri = 'data:image/png;base64,' + logoBase64;

// 1. index.html 업데이트
const indexHtmlPath = path.join(baseDir, 'app_build', 'client', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// (A) 헤더 로고 크기 2/3 (25px) 및 타이틀 15px로 축소
const brandLogoLanding = `<a href="/" class="brand-logo" title="³DNa" style="display: flex; align-items: center; gap: 7px; text-decoration: none;">
      <img src="${dataUri}" alt="³DNa Logo" style="height: 25px; width: auto; object-fit: contain; display: block; border-radius: 3px;">
      <span style="font-size: 15px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>
    </a>`;

indexHtml = indexHtml.replace(/<a href="\/" class="brand-logo"[\s\S]*?<\/a>/, brandLogoLanding);

// (B) 상단 메인 메뉴(nav-links)에서 파트너쉽 제거 (원래 메뉴로 복원)
const cleanNavLinks = `<div class="nav-links">
      <a href="#how-it-works" class="nav-link">How It Works</a>
      <a href="#examples" class="nav-link">Showrooms</a>
      <a href="#pricing" class="nav-link">Pricing</a>
      <button class="btn-nav-signin" onclick="openSignInModal()">Sign In</button>
    </div>`;

indexHtml = indexHtml.replace(/<div class="nav-links">[\s\S]*?<\/div>/, cleanNavLinks);

// (C) 맨 아래 푸터(Footer)에 사이트맵 및 영문 Partnerships & Affiliates 링크 추가
const footerSitemap = `  <footer class="footer" style="border-top: 1px solid rgba(255,255,255,0.08); padding: 48px 24px 32px 24px; background: #030712;">
    <div style="max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 24px; padding-bottom: 28px; border-bottom: 1px solid rgba(255,255,255,0.06);">
      <div style="display: flex; align-items: center; gap: 8px;">
        <img src="${dataUri}" alt="³DNa Logo" style="height: 22px; width: auto; object-fit: contain; display: block;">
        <span style="font-size: 15px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>
      </div>
      <div class="footer-sitemap" style="display: flex; gap: 28px; align-items: center; font-size: 13.5px; flex-wrap: wrap;">
        <a href="#how-it-works" style="color: #94a3b8; text-decoration: none; transition: color 0.2s;">How It Works</a>
        <a href="#examples" style="color: #94a3b8; text-decoration: none; transition: color 0.2s;">Showrooms</a>
        <a href="#pricing" style="color: #94a3b8; text-decoration: none; transition: color 0.2s;">Pricing Plans</a>
        <a href="javascript:void(0)" onclick="openPartnershipModal()" style="color: #38bdf8; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
          <i class="fa-solid fa-handshake" style="font-size: 13px;"></i> Partnerships &amp; Affiliates
        </a>
      </div>
    </div>
    <div style="max-width: 1200px; margin: 20px auto 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; font-size: 12.5px; color: #64748b;">
      <p style="margin: 0;">© 2026 ³DNa Virtual Trade Show Commercial Platform. All rights reserved.</p>
      <div style="display: flex; gap: 16px;">
        <span>Non-Destructive Digital Twin</span>
        <span>•</span>
        <span>Instant Photo Immersive Showrooms</span>
      </div>
    </div>
  </footer>`;

indexHtml = indexHtml.replace(/<footer class="footer"[\s\S]*?<\/footer>/, footerSitemap);

// (D) 파트너쉽 모달 제목 및 영문화 처리
indexHtml = indexHtml.replace(
  `modalTitle.innerHTML = '<i class="fa-solid fa-handshake"></i> 파트너쉽 제휴 신청';`,
  `modalTitle.innerHTML = '<i class="fa-solid fa-handshake"></i> Strategic Partnerships &amp; Affiliates';`
);

fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
console.log('✅ Updated index.html: 25px logo, menu restored, footer sitemap with Partnerships & Affiliates added');

// 2. builder.html 업데이트 (25px 로고 및 15px 타이틀)
const builderHtmlPath = path.join(baseDir, 'app_build', 'client', 'builder.html');
let builderHtml = fs.readFileSync(builderHtmlPath, 'utf8');

const brandLogoBuilder = `<a href="/" class="brand-logo-wrap" title="³DNa Home" style="display: flex; align-items: center; gap: 7px; text-decoration: none;">
      <img src="${dataUri}" alt="³DNa Logo" class="brand-logo-img" style="height: 25px; width: auto; object-fit: contain; display: block; border-radius: 3px;">
      <span style="font-size: 15px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>
      <span class="badge-wizard" style="margin-left: 6px;">Smart Booth Wizard</span>
    </a>`;

builderHtml = builderHtml.replace(/<a href="\/" class="brand-logo-wrap"[\s\S]*?<\/a>/, brandLogoBuilder);
fs.writeFileSync(builderHtmlPath, builderHtml, 'utf8');
console.log('✅ Updated builder.html: 25px logo and 15px title');

// 3. demo-*.html 파일들도 25px 로고 적용
const demoFiles = ['demo-matterport.html', 'demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html', 'demo.html', 'demo-splat.html'];
demoFiles.forEach(df => {
  const p = path.join(baseDir, 'app_build', 'client', df);
  if (fs.existsSync(p)) {
    let dHtml = fs.readFileSync(p, 'utf8');
    const demoLogoClean = `<a href="/" class="brand-logo" title="³DNa Home" style="display: flex; align-items: center; gap: 6px; text-decoration: none;">
        <img src="${dataUri}" alt="³DNa Logo" style="height: 22px; width: auto; object-fit: contain; display: block;">
        <span style="font-size: 14px; font-weight: 800; letter-spacing: -0.3px; color: #fff; line-height: 1;"><span style="color: var(--cyan, #38bdf8);">³D</span>Na</span>
      </a>`;
    dHtml = dHtml.replace(/<a href="\/" class="brand-logo"[\s\S]*?<\/a>/, demoLogoClean);
    fs.writeFileSync(p, dHtml, 'utf8');
  }
});

// 4. 배포 디렉토리 동기화
const deployDirs = [
  path.join(baseDir, '_clean_deploy', 'client'),
  path.join(baseDir, '_railway_deploy', 'client')
];

deployDirs.forEach(d => {
  if (fs.existsSync(d)) {
    fs.writeFileSync(path.join(d, 'index.html'), indexHtml, 'utf8');
    fs.writeFileSync(path.join(d, 'builder.html'), builderHtml, 'utf8');
    demoFiles.forEach(df => {
      const src = path.join(baseDir, 'app_build', 'client', df);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(d, df));
      }
    });
  }
});

console.log('✅ Synchronized all changes to deploy directories!');

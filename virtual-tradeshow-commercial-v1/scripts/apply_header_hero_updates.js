const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const appBuildClient = path.join(baseDir, 'app_build', 'client');
const cleanDeployClient = path.join(baseDir, '_clean_deploy', 'client');
const railwayDeployClient = path.join(baseDir, '_railway_deploy', 'client');

let html = fs.readFileSync(path.join(appBuildClient, 'index.html'), 'utf8');

// 1. 헤더 로고 옆 타이틀 [³DNa] 크기 2배 및 텍스트 타이틀 명확히 강화
const oldBrandLogo = `<a href="/" class="brand-logo" title="³DNa" style="display: flex; align-items: center; text-decoration: none;">`;
const newBrandLogo = `<a href="/" class="brand-logo" title="³DNa" style="display: flex; align-items: center; gap: 10px; text-decoration: none;">
      <span style="font-size: 32px; font-weight: 900; letter-spacing: -1px; color: #fff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>`;

if (html.includes(oldBrandLogo)) {
  html = html.replace(oldBrandLogo, newBrandLogo);
}

// 2. 히어로 섹션 글귀 변경: ONE PHOTO • PHOTO IMMERSIVE BOOTH -> YOUR BOOTH, BEYOND THE SHOW.
html = html.replace(
  /<div class="hero-pill">[\s\S]*?<\/div>/,
  `<div class="hero-pill">\n      <i class="fa-solid fa-bolt"></i> YOUR BOOTH, BEYOND THE SHOW.\n    </div>`
);

// 3. STEP 03 글귀 변경: Setup 3 Product Pins -> Setup Product Pins
html = html.replace(
  `<div class="step-title">Setup 3 Product Pins</div>`,
  `<div class="step-title">Setup Product Pins</div>`
);

// 4. 메인 메뉴(nav-links)에 파트너쉽 신청 추가
const oldNavLinks = `<div class="nav-links">
      <a href="#how-it-works" class="nav-link">How It Works</a>
      <a href="#examples" class="nav-link">Showrooms</a>
      <a href="#pricing" class="nav-link">Pricing</a>
      <button class="btn-nav-signin" onclick="openSignInModal()">Sign In</button>
    </div>`;

const newNavLinks = `<div class="nav-links">
      <a href="#how-it-works" class="nav-link">How It Works</a>
      <a href="#examples" class="nav-link">Showrooms</a>
      <a href="#pricing" class="nav-link">Pricing</a>
      <a href="javascript:void(0)" onclick="openPartnershipModal()" class="nav-link" style="color: #38bdf8; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
        <i class="fa-solid fa-handshake" style="font-size: 13px;"></i> 파트너쉽 신청
      </a>
      <button class="btn-nav-signin" onclick="openSignInModal()">Sign In</button>
    </div>`;

if (html.includes(oldNavLinks)) {
  html = html.replace(oldNavLinks, newNavLinks);
} else {
  // 정규식 매칭으로 교체
  html = html.replace(
    /<div class="nav-links">([\s\S]*?)<button class="btn-nav-signin"/,
    `<div class="nav-links">$1<a href="javascript:void(0)" onclick="openPartnershipModal()" class="nav-link" style="color: #38bdf8; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">\n        <i class="fa-solid fa-handshake" style="font-size: 13px;"></i> 파트너쉽 신청\n      </a>\n      <button class="btn-nav-signin"`
  );
}

// 5. openPartnershipModal 함수 추가
const partnershipModalFunc = `
function openPartnershipModal() {
  openConsultationModal('Partner / Agency Collaboration');
}
`;

if (!html.includes('function openPartnershipModal')) {
  html = html.replace('function openConsultationModal', `${partnershipModalFunc}\nfunction openConsultationModal`);
}

// 6. 모바일 네비게이션 CSS에서도 파트너쉽 링크 표시 또는 적절한 스타일 지원
html = html.replace(
  `.nav-links a.nav-link {\n        display: none;\n      }`,
  `.nav-links a.nav-link:not([onclick*="openPartnershipModal"]) {\n        display: none;\n      }\n      .nav-links a.nav-link[onclick*="openPartnershipModal"] {\n        font-size: 12px;\n        padding: 5px 8px;\n      }`
);

fs.writeFileSync(path.join(appBuildClient, 'index.html'), html, 'utf8');

// 모든 배포 폴더에 동기화
[cleanDeployClient, railwayDeployClient].forEach(targetDir => {
  if (fs.existsSync(targetDir)) {
    fs.copyFileSync(path.join(appBuildClient, 'index.html'), path.join(targetDir, 'index.html'));
  }
});

console.log('✅ Updated index.html with all requested header title, hero pill, step 3, and partnership menu changes!');

const fs = require('fs');
const filePath = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// Title & Meta tags
html = html.replace(/<title>.*?<\/title>/, '<title>3DZ — Turn One Booth Photo Into an Interactive 3D Booth Free</title>');
html = html.replace(/<meta name="description" content=".*?">/, '<meta name="description" content="Upload your exhibition booth photo and business name. 3DZ generates your interactive 3D virtual booth preview with 3 product slots in seconds.">');
html = html.replace(/<meta property="og:title" content=".*?">/, '<meta property="og:title" content="3DZ — Turn One Booth Photo Into an Interactive 3D Booth Free">');
html = html.replace(/<meta property="og:description" content=".*?">/, '<meta property="og:description" content="Upload one booth photo. 3DZ creates your interactive virtual booth preview free.">');

// Nav Logo
const oldNavLogoPattern = /<a href="\/" class="brand-logo"[\s\S]*?<\/a>/;
const newNavLogo = `<a href="/" class="brand-logo" title="3DZ" style="display: flex; align-items: center; gap: 8px; text-decoration: none;">
      <div style="font-size: 26px; font-weight: 900; letter-spacing: -1px; color: #fff; line-height: 1; display: flex; align-items: center; gap: 8px;">
        <div style="width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #0284c7, #2563eb); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 14px rgba(56,189,248,0.5);">
          <i class="fa-solid fa-cube" style="font-size: 16px; color: #fff;"></i>
        </div>
        <span>3D<span style="color: #38bdf8;">Z</span></span>
      </div>
    </a>`;

if (oldNavLogoPattern.test(html)) {
  html = html.replace(oldNavLogoPattern, newNavLogo);
}

// Replace customer-facing copy occurrences
html = html.split('³DNa').join('3DZ');
html = html.split('3DNA').join('3DZ');
html = html.split("DN'a").join('3DZ');

// Ensure proper domain references
html = html.split('v-show-commercial-v1-production.up.railway.app').join('v-show-commercial-v1-production.up.railway.app');

// Fix activeProjectData assignment in executeBoothGeneration
html = html.replace(
  `            hideProgress();
            activeProjectId = data.projectId;
            try {
              const safeProject = {
                id: activeProjectData?.id || activeProjectId,`,
  `            hideProgress();
            activeProjectId = data.projectId;
            activeProjectData = data.project;
            try {
              const safeProject = {
                id: activeProjectData?.id || activeProjectId,`
);

fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully updated branding to 3DZ across app_build/client/index.html');
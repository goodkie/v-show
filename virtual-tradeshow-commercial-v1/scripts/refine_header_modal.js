const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const appBuildClient = path.join(baseDir, 'app_build', 'client');
const cleanDeployClient = path.join(baseDir, '_clean_deploy', 'client');
const railwayDeployClient = path.join(baseDir, '_railway_deploy', 'client');

let html = fs.readFileSync(path.join(appBuildClient, 'index.html'), 'utf8');

// 1. 헤더 로고 영역 깔끔한 2배 크기 텍스트 타이틀 정돈
// 심볼 로고(아이콘) + 2배 크기의 ³DNa 텍스트 (30px)
const brandLogoClean = `<a href="/" class="brand-logo" title="³DNa" style="display: flex; align-items: center; gap: 10px; text-decoration: none;">
      <div style="width: 38px; height: 38px; background: linear-gradient(135deg, #0284c7, #2563eb); border: 1.5px solid #38bdf8; border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(2,132,199,0.5);">
        <i class="fa-solid fa-cube" style="color: #fff; font-size: 19px;"></i>
      </div>
      <span style="font-size: 30px; font-weight: 900; letter-spacing: -1px; color: #ffffff; display: inline-flex; align-items: center; line-height: 1;"><span style="color: #38bdf8;">³D</span>Na</span>
    </a>`;

html = html.replace(/<a href="\/" class="brand-logo"[\s\S]*?<\/a>/, brandLogoClean);

// 2. 파트너쉽 신청 모달 및 함수를 script 태그의 맨 처음에 확실하게 배치
const headScript = `
  <script>
    // ── Global Partnership & Consultation Handlers ──
    window.openPartnershipModal = function() {
      window.openConsultationModal('Partner / Agency Collaboration');
    };

    window.openConsultationModal = function(serviceName = 'AI Virtual Fitting Room') {
      const modal = document.getElementById('consultation-modal');
      if (!modal) return;
      const modalTitle = modal.querySelector('h3');
      const serviceSelect = document.getElementById('consult-service');
      const formView = document.getElementById('consultation-form-view');
      const successView = document.getElementById('consultation-success-view');

      if (modalTitle) {
        if (serviceName.includes('Partner')) {
          modalTitle.innerHTML = '<i class="fa-solid fa-handshake"></i> 파트너쉽 제휴 신청';
        } else if (serviceName.includes('Makeup')) {
          modalTitle.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Beauty Studio Consultation';
        } else {
          modalTitle.innerHTML = '<i class="fa-solid fa-handshake"></i> Fashion Consultation';
        }
      }

      if (serviceSelect) {
        let exists = Array.from(serviceSelect.options).some(opt => opt.value === serviceName);
        if (!exists) {
          const opt = document.createElement('option');
          opt.value = serviceName;
          opt.textContent = serviceName;
          serviceSelect.appendChild(opt);
        }
        serviceSelect.value = serviceName;
      }

      if (formView) formView.style.display = 'block';
      if (successView) successView.style.display = 'none';
      modal.style.display = 'flex';
      modal.style.zIndex = '9999999';
    };

    window.closeConsultationModal = function() {
      const modal = document.getElementById('consultation-modal');
      if (modal) modal.style.display = 'none';
    };
  `;

// <script> 시작 부분에 주입
html = html.replace('  <!-- Client JavaScript Logic -->\n  <script>', `  <!-- Client JavaScript Logic -->\n${headScript}`);

fs.writeFileSync(path.join(appBuildClient, 'index.html'), html, 'utf8');

[cleanDeployClient, railwayDeployClient].forEach(targetDir => {
  if (fs.existsSync(targetDir)) {
    fs.copyFileSync(path.join(appBuildClient, 'index.html'), path.join(targetDir, 'index.html'));
  }
});

console.log('✅ Perfectly refined Header Brand Logo and modal handlers!');

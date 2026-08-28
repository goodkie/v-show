const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const indexHtmlPath = path.join(baseDir, 'app_build', 'client', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// 상단 중복된 깨진 스크립트 블록 완전 정리
const cleanTopScript = `
  <!-- Client JavaScript Logic -->
  <script>
    // ── Global Partnership & Consultation Handlers ──
    window.openPartnershipModal = function() {
      window.openConsultationModal('Partner / Agency Collaboration');
    };

    window.openConsultationModal = function(serviceName = 'Partner / Agency Collaboration') {
      const modal = document.getElementById('consultation-modal');
      if (!modal) return;
      const modalTitle = document.getElementById('consultation-modal-title');
      const modalDesc = document.getElementById('consultation-modal-desc');
      const serviceSelect = document.getElementById('consult-service');
      const formView = document.getElementById('consultation-form-view');
      const successView = document.getElementById('consultation-success-view');

      if (modalTitle) {
        if (serviceName.includes('Partner') || serviceName.includes('Affiliate') || serviceName.includes('Agency')) {
          modalTitle.innerHTML = '<i class="fa-solid fa-handshake"></i> Strategic Partnerships &amp; Affiliates';
          if (modalDesc) modalDesc.textContent = 'Partner with ³DNa for agency co-marketing, virtual showroom integrations, affiliate commissions, or bespoke commercial deployments.';
        } else if (serviceName.includes('Makeup') || serviceName.includes('Beauty')) {
          modalTitle.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Beauty Studio Consultation';
          if (modalDesc) modalDesc.textContent = 'Discuss custom AI Virtual Beauty & Makeup Studio integration for your luxury cosmetics brand or retail exhibitions.';
        } else {
          modalTitle.innerHTML = '<i class="fa-solid fa-person-booth"></i> Virtual Fitting Room Consultation';
          if (modalDesc) modalDesc.textContent = 'Discuss custom AI Virtual Fitting Room integration for your brand, showroom, or upcoming fashion exhibition.';
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

    // Auto-hide video loader overlay on ready
    window.addEventListener('DOMContentLoaded', () => {
      ['vfr-video-player', 'vma-video-player'].forEach(id => {
        const vid = document.getElementById(id);
        const ldrId = id.startsWith('vfr') ? 'vfr-loader' : 'vma-loader';
        const ldr = document.getElementById(ldrId);
        if (vid && ldr) {
          const hideLoader = () => {
            ldr.style.opacity = '0';
            setTimeout(() => { ldr.style.display = 'none'; }, 300);
          };
          vid.addEventListener('loadeddata', hideLoader, { once: true });
          vid.addEventListener('canplay', hideLoader, { once: true });
          vid.addEventListener('playing', hideLoader, { once: true });
          vid.addEventListener('timeupdate', hideLoader, { once: true });
          if (vid.readyState >= 2 || !vid.paused) hideLoader();
          setTimeout(hideLoader, 1500);
        }
      });
    });
`;

// 스크립트 시작 부분부터 첫 번째 함수 정의까지 정돈
indexHtml = indexHtml.replace(/<!-- Client JavaScript Logic -->\s*<script>[\s\S]*?window\.openPartnershipModal = function[\s\S]*?\}\);/m, cleanTopScript.trim());

fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');

// 동기화
['_clean_deploy', '_railway_deploy'].forEach(dir => {
  fs.writeFileSync(path.join(baseDir, dir, 'client', 'index.html'), indexHtml, 'utf8');
});

console.log('✅ Syntax error cleanly eliminated!');

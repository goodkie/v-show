const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const indexHtmlPath = path.join(baseDir, 'app_build', 'client', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// 1. AI Virtual Fitting Room 및 AI Virtual Makeup Artist 비디오 태그 최적화 (autoplay, loop, muted, playsinline, preload="auto")
const vfrVideoTarget = `<video id="vfr-video-player" src="/assets/demo/virtual-fitting-room/fashion.mp4" playsinline muted loop preload="metadata" poster="/assets/demo/virtual-fitting-room/fashion-poster-last-frame.jpg" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;"></video>`;
const vfrVideoOptimal = `<video id="vfr-video-player" src="/assets/demo/virtual-fitting-room/fashion.mp4" autoplay loop muted playsinline preload="auto" poster="/assets/demo/virtual-fitting-room/fashion-poster-last-frame.jpg" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;"></video>`;
indexHtml = indexHtml.replace(vfrVideoTarget, vfrVideoOptimal);

const vmaVideoTarget = `<video id="vma-video-player" src="/assets/demo/virtual-makeup-artist/makeup.mp4" playsinline muted loop preload="metadata" poster="/assets/demo/virtual-makeup-artist/makeup-poster-last-frame.jpg" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;"></video>`;
const vmaVideoOptimal = `<video id="vma-video-player" src="/assets/demo/virtual-makeup-artist/makeup.mp4" autoplay loop muted playsinline preload="auto" poster="/assets/demo/virtual-makeup-artist/makeup-poster-last-frame.jpg" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;"></video>`;
indexHtml = indexHtml.replace(vmaVideoTarget, vmaVideoOptimal);

// 2. togglePlayVideo 개선 (로더 즉각 제거 및 부드러운 재생)
const togglePlayFunc = `
function togglePlayVideo(videoId, btnId) {
  const video = document.getElementById(videoId);
  const btn = document.getElementById(btnId);
  const ldrId = videoId.startsWith('vfr') ? 'vfr-loader' : 'vma-loader';
  const ldr = document.getElementById(ldrId);
  if (ldr) {
    ldr.style.opacity = '0';
    setTimeout(() => { ldr.style.display = 'none'; }, 200);
  }
  if (!video) return;
  if (video.paused) {
    video.play().catch(err => console.log('Playback error:', err));
  } else {
    video.pause();
  }
}
`;

indexHtml = indexHtml.replace(/function togglePlayVideo[\s\S]*?}\n}/, togglePlayFunc);

// 3. 로더 자동 숨김 로직 강화 (loadeddata, timeupdate, canplay 시 즉시 숨김)
const robustLoaderScript = `
    // Hide media loaders once media is ready
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

indexHtml = indexHtml.replace(/\/\/ Hide media loaders once media is ready[\s\S]*?\}\);/m, robustLoaderScript.trim());

// 4. Partnerships & Affiliates 모달 전체 100% 영문화
const partnershipModalEnglish = `
  <div id="consultation-modal" class="modal-overlay" style="display: none; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(10px); z-index: 9999999; align-items: center; justify-content: center; padding: 20px;">
    <div class="modal-card" style="max-width: 500px; width: 100%; background: #070e1b; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 20px; padding: 28px; color: #fff; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9); max-height: 90vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 id="consultation-modal-title" style="font-size: 20px; font-weight: 800; color: #38bdf8; display: flex; align-items: center; gap: 8px; margin: 0;">
          <i class="fa-solid fa-handshake"></i> Strategic Partnerships &amp; Affiliates
        </h3>
        <button style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer;" onclick="closeConsultationModal()">&times;</button>
      </div>

      <div id="consultation-form-view">
        <p id="consultation-modal-desc" style="font-size: 13.5px; color: #94a3b8; margin-bottom: 20px; line-height: 1.5;">
          Partner with ³DNa for agency co-marketing, virtual showroom integrations, affiliate commissions, or bespoke commercial deployments.
        </p>

        <form onsubmit="handleConsultationSubmit(event)">
          <div style="margin-bottom: 14px;">
            <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Brand / Organization / Agency Name *</label>
            <input type="text" id="consult-biz" required placeholder="e.g. Nexus Global Media / Maison de Vantélle" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:14px; box-sizing: border-box;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div>
              <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Contact Person *</label>
              <input type="text" id="consult-name" required placeholder="e.g. Claire Bennett" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:14px; box-sizing: border-box;">
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Business Email *</label>
              <input type="email" id="consult-email" required placeholder="e.g. claire@nexusglobal.com" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:14px; box-sizing: border-box;">
            </div>
          </div>

          <div style="margin-bottom: 14px;">
            <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Partnership / Service Track *</label>
            <select id="consult-service" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:13.5px; box-sizing: border-box;">
              <option value="Partner / Agency Collaboration">Agency &amp; Event Producer Collaboration</option>
              <option value="Affiliate & Referral Partner">Affiliate &amp; Referral Partner Program</option>
              <option value="Commercial Showroom Licensing">Commercial Showroom Licensing</option>
              <option value="AI Virtual Fitting Room">AI Virtual Fitting Room Custom Integration</option>
              <option value="AI Virtual Makeup Artist">AI Virtual Beauty Studio Custom Integration</option>
              <option value="Custom Enterprise Solution">Custom Enterprise 3D Solution</option>
            </select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div>
              <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Estimated Scope / Client Volume</label>
              <select id="consult-count" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:13.5px; box-sizing: border-box;">
                <option value="1 - 5 Accounts / Brands">1 - 5 Accounts / Brands</option>
                <option value="6 - 20 Accounts / Brands">6 - 20 Accounts / Brands</option>
                <option value="20+ Enterprise Portfolio">20+ Enterprise Portfolio</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Project Timeline</label>
              <select id="consult-timeline" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:13.5px; box-sizing: border-box;">
                <option value="Immediate (1-2 weeks)">Immediate (1-2 weeks)</option>
                <option value="Within 1 month">Within 1 month</option>
                <option value="Upcoming Trade Show / Season">Upcoming Trade Show / Season</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom: 18px;">
            <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Collaboration Proposal / Requirements</label>
            <textarea id="consult-msg" rows="3" placeholder="Describe your agency client profile, trade show project goals, or specific API/white-label requirements..." style="width:100%; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:8px 12px; color:#fff; font-size:13px; box-sizing: border-box;"></textarea>
          </div>

          <div id="consult-error-msg" style="display:none; font-size:12px; color:#f87171; margin-bottom:14px; font-weight:700;"></div>

          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button type="button" class="btn-ui" onclick="closeConsultationModal()" style="background:rgba(255,255,255,0.05); border:1px solid #334155; color:#94a3b8; padding:10px 18px; border-radius:8px; cursor:pointer;">Cancel</button>
            <button type="submit" id="btn-submit-consult" style="background: linear-gradient(135deg, #0284c7, #0369a1); color:#fff; font-weight:800; padding:10px 22px; border-radius:8px; border:1px solid #38bdf8; cursor:pointer;">
              <i class="fa-solid fa-paper-plane"></i> Submit Application
            </button>
          </div>
        </form>
      </div>

      <!-- Success View (English) -->
      <div id="consultation-success-view" style="display:none; text-align:center; padding: 20px 0;">
        <div style="width: 56px; height: 56px; background: rgba(74, 222, 128, 0.1); border: 1px solid #4ade80; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 24px; color: #4ade80;">
          <i class="fa-solid fa-check"></i>
        </div>
        <h4 style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 8px;">THANK YOU</h4>
        <p style="font-size: 14px; color: #94a3b8; margin-bottom: 16px;">Your partnership application has been submitted successfully.</p>
        <div style="background: #030712; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; margin-bottom: 24px;">
          <span style="font-size: 12px; color: #64748b; display: block; margin-bottom: 4px;">Application Reference ID</span>
          <span id="consult-ref-id" style="font-size: 16px; font-weight: 900; color: #38bdf8; letter-spacing: 1px;">3DNA-PTN-000000</span>
        </div>
        <p style="font-size: 12.5px; color: #64748b; margin-bottom: 24px;">Our global partnership director will contact you via email within 24 business hours.</p>
        <div style="display: flex; justify-content: center; gap: 12px;">
          <button type="button" onclick="closeConsultationModal()" style="background: #0284c7; border: 1px solid #38bdf8; color: #fff; font-weight: 800; padding: 10px 24px; border-radius: 8px; cursor: pointer;">Done</button>
          <a href="#examples" onclick="closeConsultationModal()" style="background: rgba(255,255,255,0.05); border: 1px solid #334155; color: #cbd5e1; font-weight: 700; padding: 10px 18px; border-radius: 8px; text-decoration: none;">Explore Showrooms</a>
        </div>
      </div>

    </div>
  </div>
`;

indexHtml = indexHtml.replace(/<div id="consultation-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, partnershipModalEnglish.trim());

// 5. openPartnershipModal 및 openConsultationModal 함수 영문 라벨 동기화
const openModalFuncs = `
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
`;

indexHtml = indexHtml.replace(/window\.openPartnershipModal = function[\s\S]*?modal\.style\.zIndex = '9999999';\n\s*};/, openModalFuncs.trim());

fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');

// 6. _clean_deploy 및 _railway_deploy 에 동기화
['_clean_deploy', '_railway_deploy'].forEach(dir => {
  fs.writeFileSync(path.join(baseDir, dir, 'client', 'index.html'), indexHtml, 'utf8');
});

console.log('✅ Perfectly updated index.html with seamless video autoplay, robust loader, and 100% English Partnerships & Affiliates modal!');

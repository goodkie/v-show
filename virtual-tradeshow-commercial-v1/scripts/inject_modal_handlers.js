const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const appBuildClient = path.join(baseDir, 'app_build', 'client');
const cleanDeployClient = path.join(baseDir, '_clean_deploy', 'client');
const railwayDeployClient = path.join(baseDir, '_railway_deploy', 'client');

let html = fs.readFileSync(path.join(appBuildClient, 'index.html'), 'utf8');

const functionsToInject = `
// ── Global Consultation & Partnership Modal Handlers ──────────────────
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
};

window.closeConsultationModal = function() {
  const modal = document.getElementById('consultation-modal');
  if (modal) modal.style.display = 'none';
};

window.handleConsultationSubmit = async function(e) {
  e.preventDefault();
  const biz = document.getElementById('consult-biz').value.trim();
  const name = document.getElementById('consult-name').value.trim();
  const email = document.getElementById('consult-email').value.trim();
  const service = document.getElementById('consult-service').value;
  const count = document.getElementById('consult-count')?.value || 'N/A';
  const timeline = document.getElementById('consult-timeline')?.value || 'N/A';
  const msg = document.getElementById('consult-msg')?.value || '';

  const errEl = document.getElementById('consult-error-msg');
  const btn = document.getElementById('btn-submit-consult');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/consultations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: biz,
        contactName: name,
        email,
        service,
        productCount: count,
        timeline,
        message: msg,
        source: 'landing_page'
      })
    });
    
    document.getElementById('consultation-form-view').style.display = 'none';
    const successView = document.getElementById('consultation-success-view');
    successView.style.display = 'block';
    const refIdEl = document.getElementById('consult-ref-id');
    if (refIdEl) {
      refIdEl.textContent = '3DNA-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = 'Failed to submit. Please try again.';
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
};
`;

// 기존 중복 제거 후 </script> 직전에 확실하게 주입
html = html.replace(/\/\/ ── Global Consultation & Partnership Modal Handlers[\s\S]*?window\.handleConsultationSubmit[\s\S]*?};/g, '');
html = html.replace('</script>', `${functionsToInject}\n</script>`);

fs.writeFileSync(path.join(appBuildClient, 'index.html'), html, 'utf8');

[cleanDeployClient, railwayDeployClient].forEach(targetDir => {
  if (fs.existsSync(targetDir)) {
    fs.copyFileSync(path.join(appBuildClient, 'index.html'), path.join(targetDir, 'index.html'));
  }
});

console.log('✅ Injected clean window.openPartnershipModal handlers into index.html');

const fs = require('fs');
let html = fs.readFileSync('app_build/client/index.html', 'utf8');

// openConsultationModal 함수 확실한 전역 노출 및 display 제어
const modalOpenLogic = `
function openConsultationModal(serviceName) {
  const m = document.getElementById('consultation-modal');
  if (m) {
    m.style.setProperty('display', 'flex', 'important');
    m.style.zIndex = '999999';
    document.getElementById('consultation-form-view').style.display = 'block';
    document.getElementById('consultation-success-view').style.display = 'none';
    if (serviceName) {
      const sel = document.getElementById('consult-service');
      if (sel) sel.value = serviceName;
    }
  }
}

function closeConsultationModal() {
  const m = document.getElementById('consultation-modal');
  if (m) {
    m.style.setProperty('display', 'none', 'important');
  }
}
`;

html = html.replace(/function openConsultationModal[\s\S]*?function closeConsultationModal[\s\S]*?\}/m, modalOpenLogic.trim());

fs.writeFileSync('app_build/client/index.html', html, 'utf8');
console.log('✅ openConsultationModal updated with setProperty important');

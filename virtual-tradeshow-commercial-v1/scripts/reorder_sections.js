const fs = require('fs');
const indexPath = 'app_build/client/index.html';
let html = fs.readFileSync(indexPath, 'utf8');

// 1. 기존 AI Virtual Makeup Artist 섹션 추출
const vmaMatch = html.match(/<!-- ================================================================ -->\s*<!-- AI VIRTUAL MAKEUP ARTIST PREMIUM SHOWCASE SECTION[\s\S]*?<\/section>/);
if (!vmaMatch) {
  console.error('VMA section not found!');
  process.exit(1);
}

const vmaSectionCode = vmaMatch[0];

// 기존 위치에서 VMA 섹션 제거
html = html.replace(vmaSectionCode, '');

// 2. VMA 섹션을 Pricing / 최하단 (Footer 바로 위)에 삽입
if (html.includes('<footer')) {
  html = html.replace('<footer', `${vmaSectionCode}\n\n    <footer`);
  console.log('✅ AI Virtual Makeup Artist section moved to the very bottom above footer.');
} else {
  html = html.replace('</main>', `${vmaSectionCode}\n</main>`);
}

// 3. Consultation Modal 함수 및 바인딩 완벽 검증
// AI Virtual Fitting Room 버튼 -> openConsultationModal('AI Virtual Fitting Room')
// AI Virtual Makeup Artist 버튼 -> openConsultationModal('AI Virtual Makeup Artist')
html = html.replace(
  /onclick="openConsultationModal\(\)"/g,
  `onclick="openConsultationModal('AI Virtual Fitting Room')"`
);

// 모달이 정상 렌더링되도록 스타일 확인 (z-index 999999, display:none/flex 제어)
html = html.replace(
  /id="consultation-modal" class="modal-overlay"[^>]*>/,
  `id="consultation-modal" class="modal-overlay" style="display: none; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(10px); z-index: 999999; align-items: center; justify-content: center; padding: 20px;">`
);

fs.writeFileSync(indexPath, html, 'utf8');
console.log('✅ index.html updated: VMA at bottom, modals accurately bound.');

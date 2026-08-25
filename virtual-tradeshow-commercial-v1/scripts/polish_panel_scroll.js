const fs = require('fs');
let html = fs.readFileSync('app_build/client/index.html', 'utf8');

// inline-verify-panel 전환 시 부드러운 스크롤 및 패널 패딩 최적화
html = html.replace(
  `document.getElementById('form-initial-view').style.display = 'none';\n        const panel = document.getElementById('inline-verify-panel');\n        panel.style.display = 'block';`,
  `document.getElementById('form-initial-view').style.display = 'none';\n        const panel = document.getElementById('inline-verify-panel');\n        panel.style.display = 'block';\n        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });`
);

fs.writeFileSync('app_build/client/index.html', html, 'utf8');
console.log('Saved index.html');

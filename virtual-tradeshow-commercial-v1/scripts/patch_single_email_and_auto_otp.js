const fs = require('fs');
let html = fs.readFileSync('app_build/client/index.html', 'utf8');

// 1. Confirm Email 필드 제거 (Work Email 하나만 유지)
html = html.replace(
  /<div class="form-group">\s*<label class="form-label" for="confirm-email-input">[\s\S]*?<\/div>/m,
  ''
);

// 2. OTP 패널에서 "VERIFY & CREATE MY BOOTH" 버튼 제거 (6자리 입력 시 100% 자동 검증)
html = html.replace(
  /<button type="button" class="btn-create-free" id="btn-verify-otp"[\s\S]*?<\/button>/m,
  ''
);

// 3. 클라이언트 JS에서 confirm-email 검증 로직 제거 및 6자리 자동 검증 보장
html = html.replace(
  /const confirmEmail = document\.getElementById\('confirm-email-input'\)\.value\.trim\(\);[\s\S]*?if \(email !== confirmEmail\) \{[\s\S]*?\}/m,
  `// Single Work Email flow (Confirm email field removed per user directive)`
);

// 4. handleFreeBoothSubmit 함수 내 불일치 검사 완전 정리
html = html.replace(
  /if \(email !== confirmEmail\) \{[\s\S]*?return;\s*\}/g,
  ''
);

// 5. changeEmail()에서 confirm-email 처리 제거
html = html.replace(
  /document\.getElementById\('confirm-email-input'\)\.value = '';/g,
  ''
);

fs.writeFileSync('app_build/client/index.html', html, 'utf8');
console.log('✅ Single email input & auto-trigger 6-digit OTP applied to index.html');

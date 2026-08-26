const fs = require('fs');
let html = fs.readFileSync('app_build/client/index.html', 'utf8');

// OTP 패널 안내 문구 보강 (버튼 없이 6자리 입력 즉시 자동 인증 안내)
html = html.replace(
  /<div style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px; letter-spacing: -0.5px;">CHECK YOUR EMAIL<\/div>/m,
  `<div style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px; letter-spacing: -0.5px;">CHECK YOUR EMAIL</div>
   <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px;">
     We sent a 6-digit confirmation code to:<br>
     <span id="verify-target-email" style="color: #38bdf8; font-weight: 700; font-size: 14px;"></span>
   </p>
   <div id="otp-loading-status" style="display: none; color: #38bdf8; font-size: 13px; font-weight: 700; margin-bottom: 12px;">
     <i class="fa-solid fa-spinner fa-spin"></i> Verifying code & creating booth...
   </div>`
);

// handleVerifyOtpClick 시작 시 스피너 표출
html = html.replace(
  /async function handleVerifyOtpClick\(\) \{/,
  `async function handleVerifyOtpClick() {
    const statusEl = document.getElementById('otp-loading-status');
    if (statusEl) statusEl.style.display = 'block';`
);

// 실패 시 스피너 숨김
html = html.replace(
  /showOtpError\((.*?)\);/g,
  `const statusEl = document.getElementById('otp-loading-status'); if (statusEl) statusEl.style.display = 'none'; showOtpError($1);`
);

fs.writeFileSync('app_build/client/index.html', html, 'utf8');
console.log('✅ OTP auto-verification feedback enhanced');

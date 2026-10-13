@echo off
chcp 65001 >nul
echo ========================================================
echo   XPIDER AutoForm Sender Pro - Unpacked Extension Sync
echo   Release: R6.9G.10.3.7.1.4.3
echo ========================================================
node -e "
const fs = require('fs');
const path = require('path');
const srcDir = path.resolve('extension');
const targets = [
  path.resolve('send_message_backup'),
  path.resolve('send_message_backup/build/extension'),
  path.resolve('E:/vivpr/ai/extensions/send_message_backup')
];
for (const target of targets) {
  if (fs.existsSync(target)) {
    fs.cpSync(srcDir, target, { recursive: true });
    console.log('[OK] Synced to: ' + target);
  }
}
"
echo.
echo ========================================================
echo [완료] 최신 익스텐션 파일이 언팩 디렉터리에 동기화되었습니다.
echo 브라우저(edge://extensions 또는 chrome://extensions)에서
echo XPIDER 카드의 [다시 로드(Reload)] 버튼을 클릭하십시오.
echo ========================================================
pause

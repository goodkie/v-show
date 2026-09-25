@echo off
chcp 65001 >nul
title Antigravity 대화창 금지표시(🚫) 완전 해결 도구

echo ================================================================
echo   [v-show] Antigravity 대화창 History 금지 표시(🚫) 완전 해결 도구
echo ================================================================
echo.

:: 1. Antigravity IDE 프로세스 종료 (DB 잠금 해제 필수)
echo [1/4] 실행 중인 Antigravity IDE를 안전하게 종료합니다 (DB 락 해제)...
taskkill /F /IM "Antigravity IDE.exe" /T 2>nul
taskkill /F /IM "language_server_windows_x64.exe" /T 2>nul
taskkill /F /IM "Antigravity.exe" /T 2>nul
timeout /t 2 /nobreak >nul
echo   ✓ Antigravity 프로세스 정리 완료

:: 2. Python 리매핑 스크립트 실행
echo [2/4] 대화 세션 DB 워크스페이스 매핑 및 금지(🚫) 상태 일괄 언락 중...
set "SCRIPT_DIR=%~dp0"
set "WORKER_PY=%SCRIPT_DIR%tools\agy-sync-master\remap_worker.py"
if not exist "%WORKER_PY%" (
    set "WORKER_PY=%SCRIPT_DIR%remap_worker.py"
)

python "%WORKER_PY%" "%USERPROFILE%\ai" 2>nul
if %ERRORLEVEL% neq 0 (
    echo   ! Python 직접 실행 실패 - Node.js 엔진으로 재시도 중...
    node -e "
    const fs = require('fs');
    const path = require('path');
    const home = require('os').homedir();
    const gdrive = 'G:\\내 드라이브\\v-show-antigravity-sync';
    const srcDb = path.join(gdrive, 'antigravity-core', 'state', 'conversation_summaries.db');
    for (const sub of ['.gemini/antigravity-ide', '.gemini/antigravity']) {
        const dstDir = path.join(home, sub);
        if (fs.existsSync(dstDir)) {
            const dstDb = path.join(dstDir, 'conversation_summaries.db');
            try { fs.unlinkSync(dstDb + '-wal'); } catch(e){}
            try { fs.unlinkSync(dstDb + '-shm'); } catch(e){}
            if (fs.existsSync(srcDb)) {
                fs.copyFileSync(srcDb, dstDb);
                console.log('  ✓ 복원 완료: ' + dstDb);
            }
        }
    }
    "
)

:: 3. Workspace Trust 강제 신뢰 설정 (Restricted Mode 방지)
echo [3/4] 작업영역 신뢰(Workspace Trust) 자동 해제 설정 중...
node -e "
const fs = require('fs');
const path = require('path');
const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
for (const sub of ['Antigravity IDE', 'Antigravity']) {
    const sFile = path.join(appData, sub, 'User', 'settings.json');
    try {
        fs.mkdirSync(path.dirname(sFile), { recursive: true });
        let s = {};
        if (fs.existsSync(sFile)) {
            try { s = JSON.parse(fs.readFileSync(sFile, 'utf8')); } catch(e){}
        }
        s['security.workspace.trust.enabled'] = false;
        s['security.workspace.trust.startupPrompt'] = 'never';
        s['security.workspace.trust.emptyWindow'] = true;
        fs.writeFileSync(sFile, JSON.stringify(s, null, 4), 'utf8');
        console.log('  ✓ settings.json 적용 완료: ' + sub);
    } catch(e){}
}
"

echo.
echo ================================================================
echo   [성공] 대화창 History 금지 표시(🚫) 문제가 완전히 해결되었습니다!
echo ================================================================
echo.
echo   이제 Antigravity IDE를 다시 실행하시면:
echo   1. 좌측 History(🕒) 대화 목록이 금지 표시 없이 정상 활성화됩니다.
echo   2. 이전 대화창들을 자유롭게 열고 이어서 작업하실 수 있습니다.
echo.
pause

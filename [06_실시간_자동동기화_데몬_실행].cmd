@echo off
chcp 65001 >nul
setlocal
title [AGY-Sync] 실시간 자동 동기화 데몬 (Auto-Sync Daemon)

set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%cli.js" (
    set "ENGINE_DIR=%SCRIPT_DIR%"
) else if exist "%SCRIPT_DIR%tools\agy-sync-master\cli.js" (
    set "ENGINE_DIR=%SCRIPT_DIR%tools\agy-sync-master\"
) else (
    echo [ERROR] agy-sync-master 엔진(cli.js)을 찾을 수 없습니다.
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

cd /d "%ENGINE_DIR%"

echo ================================================================
echo   [AGY-Sync Master] 실시간 자동 동기화 데몬 (Auto-Sync Daemon)
echo ================================================================
echo.
echo  * 기능 1: 다른 PC의 새 커밋/세션 푸시 감지 시 -> 자동 Pull
echo  * 기능 2: 현재 PC의 Antigravity 대화/커밋 변경 시 -> 자동 Push
echo  * 감지 주기: 30초 (백그라운드 실시간 모니터링)
echo.
echo 데몬을 중지하려면 창을 닫거나 Ctrl+C를 누르세요.
echo ================================================================
echo.

node cli.js auto-sync --interval 30

pause
exit

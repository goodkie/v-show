@echo off
chcp 65001 >nul
setlocal
title [AGY-Sync] 작업 완료 동기화 (PUSH)

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
echo   [AGY-Sync Master] 작업 완료 동기화 (PUSH)
echo ================================================================
echo.
echo [1] 최신 커밋을 GitHub 원격 저장소로 안전 푸시
echo [2] Antigravity 대화 DB 및 브레인 아티팩트를 Google Drive에 백업
echo.
node cli.js push

echo.
echo ================================================================
echo 동기화 완료! 다른 PC에서 작업하시려면 [03_작업시작_동기화_PULL]을 실행하세요.
echo 창을 닫으려면 아무 키나 누르세요 (5초 후 자동 종료)...
timeout /t 5 >nul 2>&1 || pause >nul
exit

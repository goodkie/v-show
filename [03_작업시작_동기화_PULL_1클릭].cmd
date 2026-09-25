@echo off
chcp 65001 >nul
setlocal
title [AGY-Sync] 작업 시작 최신화 (PULL)

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
echo   [AGY-Sync Master] 작업 시작 최신화 (PULL)
echo ================================================================
echo.
echo [1] GitHub에서 최신 소스코드 및 커밋 내역 Pull
echo [2] Google Drive에서 최신 Antigravity 세션/브레인 동기화
echo [3] 현재 PC 환경에 맞게 경로 및 세션 DB 자동 리매핑
echo.
node cli.js pull

echo.
echo ================================================================
echo 최신화 완료! Antigravity IDE에서 이어서 작업하실 수 있습니다.
echo 창을 닫으려면 아무 키나 누르세요 (5초 후 자동 종료)...
timeout /t 5 >nul 2>&1 || pause >nul
exit

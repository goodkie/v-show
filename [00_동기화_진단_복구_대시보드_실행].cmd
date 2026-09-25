@echo off
chcp 65001 >nul
setlocal
title AGY-Sync Master Dashboard

set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%server.js" (
    set "ENGINE_DIR=%SCRIPT_DIR%"
) else if exist "%SCRIPT_DIR%tools\agy-sync-master\server.js" (
    set "ENGINE_DIR=%SCRIPT_DIR%tools\agy-sync-master\"
) else (
    echo [ERROR] agy-sync-master 엔진(server.js)을 찾을 수 없습니다.
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 Node.js LTS를 설치한 후 다시 실행해주세요.
    pause
    exit /b 1
)

cd /d "%ENGINE_DIR%"

echo ================================================================
echo   [AGY-Sync Master] Universal Multi-PC Sync & Recovery Manager
echo   웹 기반 실시간 모니터링 및 진단/복구 대시보드
echo ================================================================
echo.
echo [1/2] 웹 대시보드 서버를 백그라운드에서 구동합니다...
start /b "" node server.js

timeout /t 2 >nul 2>&1
echo [2/2] 기본 웹 브라우저에서 대시보드를 엽니다 (http://localhost:3900)...
start http://localhost:3900

echo.
echo ================================================================
echo   대시보드가 브라우저에서 실행 중입니다.
echo   - 로컬 접속:   http://localhost:3900
echo   - 원격/모바일: 같은 네트워크의 다른 PC에서도 IP:3900 으로 접속 가능
echo ================================================================
echo 창을 닫으려면 아무 키나 누르세요.
pause >nul
exit

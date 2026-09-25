@echo off
chcp 65001 >nul
setlocal
title [AGY-Sync] 새 PC 무결점 원클릭 설치 및 환경 매핑

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
    echo https://nodejs.org 에서 Node.js LTS 버전을 설치한 후 다시 실행해주세요.
    pause
    exit /b 1
)

cd /d "%ENGINE_DIR%"

echo ================================================================
echo   [AGY-Sync Master] 새 PC 원클릭 설치 및 환경 자동 매핑
echo ================================================================
echo.
echo [1] GitHub에서 직접 온전한 Git 저장소(v-show) 클론
echo [2] Fast-Track 워크트리 자동 생성
echo [3] Google Drive에서 대화 히스토리 및 세션 DB 안전 복원
echo [4] 현재 PC 사용자명 및 경로에 맞춰 설정 동적 리매핑
echo.
node cli.js setup

echo.
echo ================================================================
echo 작업이 완료되었습니다. 창을 닫으려면 아무 키나 누르세요 (10초 후 자동 종료)...
timeout /t 10 >nul 2>&1 || pause >nul
exit

@echo off
chcp 65001 >nul
setlocal
title [AGY-Sync] 환경 경로 및 사용자 계정 재매핑

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
echo   [AGY-Sync Master] 환경 경로 및 사용자 계정 재매핑
echo ================================================================
echo.
echo [1] app_storage.json 내 타 PC 사용자명/경로를 현재 PC로 치환
echo [2] conversation_summaries.db SQLite URI 업데이트
echo [3] Git Worktree 양방향 포인터 재설정
echo.
node cli.js remap

echo.
echo ================================================================
echo 경로 재매핑 완료! Antigravity IDE를 재실행하거나 새로고침하세요.
echo 창을 닫으려면 아무 키나 누르세요 (5초 후 자동 종료)...
timeout /t 5 >nul 2>&1 || pause >nul
exit

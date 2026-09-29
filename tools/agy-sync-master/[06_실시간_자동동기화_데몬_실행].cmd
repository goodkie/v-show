@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title [AGY-Sync] 실시간 자동 동기화 데몬 (Auto-Sync Daemon)

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "WORK_DIR="
if exist "%BASE_DIR%\cli.js" (
    set "WORK_DIR=%BASE_DIR%"
) else if exist "%BASE_DIR%\tools\agy-sync-master\cli.js" (
    set "WORK_DIR=%BASE_DIR%\tools\agy-sync-master"
)

if not defined WORK_DIR (
    echo [ERROR] agy-sync-master cli.js 를 찾을 수 없습니다.
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

pushd "%WORK_DIR%"

echo ================================================================
echo   [AGY-Sync Master] 실시간 자동 동기화 데몬 (Auto-Sync Daemon)
echo ================================================================
echo.
echo  * 기능 1: 다른 PC의 새 커밋/세션 푸시 감지 시 -^> 자동 Pull
echo  * 기능 2: 현재 PC의 Antigravity 대화/커밋 변경 시 -^> 자동 Push
echo  * 감지 주기: 30초 (백그라운드 실시간 모니터링)
echo.
echo 데몬을 중지하려면 창을 닫거나 Ctrl+C를 누르세요.
echo ================================================================
echo.

node cli.js auto-sync --interval 30

popd
pause
exit /b 0

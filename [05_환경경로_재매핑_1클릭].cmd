@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title [AGY-Sync] 환경 경로 및 사용자 계정 재매핑

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
echo   [AGY-Sync Master] 환경 경로 및 사용자 계정 재매핑
echo ================================================================
echo.
echo [1] app_storage.json 내 타 PC 사용자명/경로를 현재 PC로 치환
echo [2] conversation_summaries.db SQLite URI 업데이트
echo [3] Git Worktree 양방향 포인터 재설정
echo.

node cli.js remap

popd

echo.
echo ================================================================
echo 경로 재매핑 완료! 창을 닫으려면 아무 키나 누르세요 (5초 후 자동 종료)...
timeout /t 5 >nul 2>&1 || pause >nul
exit /b 0

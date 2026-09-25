@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title [AGY-Sync] 저장소 정밀 진단 및 자동 복구

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
echo   [AGY-Sync Master] 저장소 정밀 진단 및 자동 복구
echo ================================================================
echo.
echo [1] Git 팩파일 및 헤드 무결성 진단
echo [2] 손상된 0바이트 팩파일 격리 및 GitHub에서 온전한 베이스 재수신
echo [3] Antigravity 대화창 세션 및 경로 리매핑 복구
echo.

node cli.js recover

popd

echo.
echo ================================================================
echo 복구 및 진단 작업이 완료되었습니다. 창을 닫으려면 아무 키나 누르세요...
pause >nul
exit /b 0

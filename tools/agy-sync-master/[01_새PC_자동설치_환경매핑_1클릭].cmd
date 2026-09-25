@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title [AGY-Sync] 새 PC 무결점 원클릭 설치 및 환경 매핑

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
    echo https://nodejs.org 에서 Node.js LTS 버전을 설치한 후 다시 실행해주세요.
    pause
    exit /b 1
)

pushd "%WORK_DIR%"

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

popd

echo.
echo ================================================================
echo 작업이 완료되었습니다. 창을 닫으려면 아무 키나 누르세요...
pause >nul
exit /b 0

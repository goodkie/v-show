@echo off
chcp 65001 >nul
title AGY-Sync Master Launcher

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Node.js 실행 바이너리 확인
set "NODE_CMD=node"
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_CMD=C:\Program Files\nodejs\node.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
        set "NODE_CMD=%LOCALAPPDATA%\Programs\node\node.exe"
    ) else (
        echo [ERROR] Node.js가 설치되어 있지 않습니다.
        echo https://nodejs.org 에서 Node.js를 설치해 주세요.
        pause
        exit /b 1
    )
)

echo ================================================================
echo   [AGY-Sync Master] 범용 멀티 PC 통합 동기화 대시보드 시작
echo ================================================================
echo.
"%NODE_CMD%" server.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] 프로그램이 예기치 않게 종료되었습니다.
    pause
)

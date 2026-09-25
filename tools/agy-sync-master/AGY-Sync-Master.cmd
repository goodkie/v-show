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

:: Git safe.directory 사전 등록 (소유권 불일치 방지)
where git >nul 2>nul
if %ERRORLEVEL% equ 0 (
    git config --global --add safe.directory "*" >nul 2>nul
)

echo ================================================================
echo   [AGY-Sync Master] 범용 멀티 PC 통합 동기화 대시보드 시작
echo ================================================================
echo.

:RESTART_LOOP
echo [%TIME%] AGY-Sync Master 서버 시작 중...
"%NODE_CMD%" server.js
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% equ 0 (
    :: exit(0) = 자동 재시작 신호 (engine.js 업데이트 등)
    echo.
    echo [%TIME%] 새 버전 감지 - 자동 재시작 중... (Ctrl+C로 중단 가능)
    echo.
    timeout /t 1 /nobreak >nul
    goto RESTART_LOOP
) else (
    echo.
    echo [ERROR] 프로그램이 예기치 않게 종료되었습니다. (코드: %EXIT_CODE%)
    pause
)

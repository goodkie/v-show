@echo off
setlocal
title XPIDER Local Test Site Server (Port 8088)
cd /d "%~dp0"
echo ========================================================================
echo   STARTING XPIDER LOCAL TEST SITE SERVER (http://127.0.0.1:8088)
echo ========================================================================
echo.

set "XPIDER_NODE="
if exist "%~dp0runtime\node\node.exe" (
    set "XPIDER_NODE=%~dp0runtime\node\node.exe"
) else (
    where node >nul 2>&1
    if !errorlevel! equ 0 (
        set "XPIDER_NODE=node"
    )
)

if not defined XPIDER_NODE (
    echo [ERROR] Bundled Node.js runtime not found and Node.js is not in PATH!
    pause
    exit /b 1
)

"%XPIDER_NODE%" owner-extension-test-site\server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Test server exited with error code %errorlevel%.
    pause
)

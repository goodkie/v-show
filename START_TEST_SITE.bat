@echo off
title XPIDER Local Test Site Server (Port 8088)
cd /d "%~dp0"
echo ========================================================================
echo   STARTING XPIDER LOCAL TEST SITE SERVER (http://127.0.0.1:8088)
echo ========================================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please ensure Node.js is installed to run the local test server.
    pause
    exit /b 1
)

node owner-extension-test-site\server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Test server exited with error code %errorlevel%.
    pause
)

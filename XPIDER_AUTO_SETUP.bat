@echo off
setlocal EnableDelayedExpansion

echo ========================================================
echo   XPIDER AutoForm Sender Pro - One-Click OS Auto Setup
echo   Privacy Relay Companion + Native Messaging Host Installer
echo ========================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js (https://nodejs.org) to run the Privacy Relay Companion.
    pause
    exit /b 1
)

echo [1/3] Registering Windows Autostart for Privacy Relay...
if exist "companion\install_autostart.js" (
    node companion\install_autostart.js
    if !ERRORLEVEL! NEQ 0 (
        echo [WARNING] Autostart registration returned non-zero exit code.
    ) else (
        echo [OK] Windows Autostart registered successfully.
    )
) else (
    echo [INFO] companion\install_autostart.js not present, skipping autostart.
)

echo.
echo [2/3] Registering Native Messaging Host for Google Chrome and Microsoft Edge...
if exist "companion\install_native_host.js" (
    node companion\install_native_host.js %*
    if !ERRORLEVEL! NEQ 0 (
        echo [FATAL] Native Messaging Host registration failed!
        pause
        exit /b 1
    ) else (
        echo [OK] Native Messaging Host manifests registered in Windows Registry.
    )
) else (
    echo [FATAL] companion\install_native_host.js not found!
    pause
    exit /b 1
)

echo.
echo [3/3] Starting Privacy Relay Companion in background...
if exist "companion\start_relay_silent.vbs" (
    wscript.exe companion\start_relay_silent.vbs
) else if exist "companion\privacy_relay.js" (
    start "" /b node companion\privacy_relay.js
)
timeout /t 2 /nobreak >nul

echo.
echo ========================================================
echo   Auto Setup Completed Successfully!
echo   - Native Messaging Host: REGISTERED (Chrome & Edge)
echo   - Privacy Relay Service: RUNNING on 127.0.0.1:18988 / 18989
echo ========================================================
echo You may now open Chrome / Edge, reload XPIDER, and start campaigns.
echo.
exit /b 0

@echo off
setlocal EnableDelayedExpansion

echo ========================================================
echo   XPIDER Privacy Relay Companion - Windows Setup
echo   Zero-Manual-Launch Installation (Fail-Closed)
echo ========================================================

cd /d "%~dp0"

echo [1/3] Registering autostart on user logon...
node install_autostart.js
if %ERRORLEVEL% NEQ 0 (
    echo [FATAL] Step 1 Failed: Could not register Windows autostart.
    echo [ABORT] Installation aborted with exit code %ERRORLEVEL%.
    exit /b %ERRORLEVEL%
)

echo [2/3] Registering Native Messaging Host for Chrome and Edge...
node install_native_host.js %*
if %ERRORLEVEL% NEQ 0 (
    echo [FATAL] Step 2 Failed: Native Messaging Host registration failed.
    echo [ROLLBACK] Reverting Step 1: uninstalling autostart...
    node install_autostart.js --uninstall
    echo [ABORT] Installation failed and rolled back. Companion Relay was NOT started.
    exit /b 1
)

echo [3/3] Starting Privacy Relay in silent background mode...
wscript.exe start_relay_silent.vbs
if %ERRORLEVEL% NEQ 0 (
    echo [FATAL] Step 3 Failed: Could not launch Privacy Relay background process.
    echo [ROLLBACK] Reverting all installation steps...
    node install_native_host.js --uninstall
    node install_autostart.js --uninstall
    echo [ABORT] Installation failed and rolled back.
    exit /b %ERRORLEVEL%
)

echo ========================================================
echo   Installation Complete!
echo   Privacy Relay is running silently on 127.0.0.1:18988 / 18989.
echo   You may now open Chrome / Edge and start XPIDER.
echo ========================================================
exit /b 0

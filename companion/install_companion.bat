@echo off
setlocal EnableDelayedExpansion

echo ========================================================
echo   XPIDER Privacy Relay Companion - Windows Setup
echo   Zero-Manual-Launch Installation (Fail-Closed)
echo ========================================================

cd /d "%~dp0"

set "XPIDER_NODE="
if exist "%~dp0..\runtime\node\node.exe" (
    set "XPIDER_NODE=%~dp0..\runtime\node\node.exe"
) else if exist "%~dp0runtime\node\node.exe" (
    set "XPIDER_NODE=%~dp0runtime\node\node.exe"
) else (
    where node >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        for /f "delims=" %%I in ('where node') do (
            if not defined XPIDER_NODE set "XPIDER_NODE=%%I"
        )
    )
)

if not defined XPIDER_NODE (
    echo [ERROR] Bundled Node.js runtime not found and Node.js is not in PATH!
    pause
    exit /b 1
)

echo [1/3] Registering autostart on user logon...
"%XPIDER_NODE%" install_autostart.js
if %ERRORLEVEL% NEQ 0 (
    echo [FATAL] Step 1 Failed: Could not register Windows autostart.
    echo [ABORT] Installation aborted with exit code %ERRORLEVEL%.
    exit /b %ERRORLEVEL%
)

echo [2/3] Registering Native Messaging Host for Chrome and Edge...
"%XPIDER_NODE%" install_native_host.js %*
if %ERRORLEVEL% NEQ 0 (
    echo [FATAL] Step 2 Failed: Native Messaging Host registration failed.
    echo [ROLLBACK] Reverting Step 1: uninstalling autostart...
    "%XPIDER_NODE%" install_autostart.js --uninstall
    echo [ABORT] Installation failed and rolled back. Companion Relay was NOT started.
    exit /b 1
)

echo [3/3] Starting Privacy Relay in silent background mode...
wscript.exe start_relay_silent.vbs
if %ERRORLEVEL% NEQ 0 (
    echo [FATAL] Step 3 Failed: Could not launch Privacy Relay background process.
    echo [ROLLBACK] Reverting all installation steps...
    "%XPIDER_NODE%" install_native_host.js --uninstall
    "%XPIDER_NODE%" install_autostart.js --uninstall
    echo [ABORT] Installation failed and rolled back.
    exit /b %ERRORLEVEL%
)

echo ========================================================
echo   Installation Complete!
echo   Privacy Relay is running silently on 127.0.0.1:18988 / 18989.
echo   You may now open Chrome / Edge and start XPIDER.
echo ========================================================
exit /b 0

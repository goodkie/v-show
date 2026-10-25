@echo off
setlocal EnableDelayedExpansion

echo ========================================================
echo   XPIDER AutoForm Sender Pro - Clean Rollback / Teardown
echo ========================================================
echo.

cd /d "%~dp0"

if exist "companion\uninstall_companion.bat" (
    call companion\uninstall_companion.bat --silent
) else (
    powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 18989 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Get-CimInstance Win32_Process -Filter \"CommandLine LIKE '%%privacy-relay-service.js%%'\" -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
    reg delete "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.xpider.native_host" /f >nul 2>&1
    reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.xpider.native_host" /f >nul 2>&1
    reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "XPIDER_Privacy_Relay" /f >nul 2>&1
)

echo [OK] Background companion processes stopped.
echo [OK] Native Messaging Host registry entries removed from HKCU.
echo [OK] Windows Startup registration removed.
echo [NOTE] Owner DPAPI encryption tokens and local state files remain safely preserved.
echo.
echo ========================================================
echo   Rollback Complete! System restored to pre-install state.
echo ========================================================
if "%1" neq "--silent" pause
exit /b 0

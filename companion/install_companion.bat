@echo off
echo ========================================================
echo   XPIDER Privacy Relay Companion - Windows Setup
echo   Zero-Manual-Launch Installation
echo ========================================================

cd /d "%~dp0"

echo [1/3] Registering autostart on user logon...
node install_autostart.js

echo [2/3] Registering Native Messaging Host for Chrome and Edge...
node install_native_host.js %*

echo [3/3] Starting Privacy Relay in silent background mode...
wscript.exe start_relay_silent.vbs

echo ========================================================
echo   Installation Complete!
echo   Privacy Relay is running silently on 127.0.0.1:18988 / 18989.
echo   You may now open Chrome / Edge and start XPIDER.
echo ========================================================
pause

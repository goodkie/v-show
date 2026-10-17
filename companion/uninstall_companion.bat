@echo off
setlocal EnableDelayedExpansion
echo ========================================================
echo   XPIDER Privacy Relay Companion - Uninstall
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

echo [1/3] Stopping background Privacy Relay service...
if defined XPIDER_NODE (
    "%XPIDER_NODE%" -e "const fs=require('fs'); const http=require('http'); const path=require('path'); let token=''; try { token=fs.readFileSync(path.join(__dirname, '.control_token'), 'utf8').trim(); } catch(_) {} const headers={'Content-Type':'application/json'}; if(token) headers['Authorization']='Bearer '+token; const req=http.request({hostname:'127.0.0.1',port:18989,path:'/stop',method:'POST',headers}, res=>setTimeout(()=>process.exit(0), 100)); req.on('error', ()=>process.exit(0)); req.setTimeout(1500, ()=>process.exit(0)); req.end();"
)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 18989 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Get-CimInstance Win32_Process -Filter \"CommandLine LIKE '%%privacy-relay-service.js%%'\" -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [2/3] Removing Windows Startup registration...
if defined XPIDER_NODE (
    "%XPIDER_NODE%" install_autostart.js --uninstall
)

echo [3/3] Unregistering Native Messaging Host...
if defined XPIDER_NODE (
    "%XPIDER_NODE%" install_native_host.js --uninstall
)

echo ========================================================
echo   Uninstallation Complete!
echo ========================================================
if "%1" neq "--silent" pause

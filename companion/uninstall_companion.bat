@echo off
echo ========================================================
echo   XPIDER Privacy Relay Companion - Uninstall
echo ========================================================

cd /d "%~dp0"

echo [1/3] Stopping background Privacy Relay service...
node -e "const http=require('http'); const req=http.request({hostname:'127.0.0.1',port:18989,path:'/stop',method:'POST'}, res=>process.exit(0)); req.on('error', ()=>process.exit(0)); req.setTimeout(1000, ()=>process.exit(0)); req.end();"

echo [2/3] Removing Windows Startup registration...
node install_autostart.js --uninstall

echo [3/3] Unregistering Native Messaging Host...
node install_native_host.js --uninstall

echo ========================================================
echo   Uninstallation Complete!
echo ========================================================
pause

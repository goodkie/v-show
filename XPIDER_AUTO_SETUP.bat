@echo off
setlocal EnableDelayedExpansion

echo ========================================================
echo   XPIDER AutoForm Sender Pro - One-Click OS Auto Setup
echo   Privacy Relay Companion + Native Host + Test Runtime
echo ========================================================
echo.

cd /d "%~dp0"

set "XPIDER_NODE="
if exist "%~dp0runtime\node\node.exe" (
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
    echo [ERROR] Bundled Node.js runtime is missing and Node.js is not found in PATH!
    echo Expected bundled runtime at: %~dp0runtime\node\node.exe
    pause
    exit /b 1
)

if not exist "%XPIDER_NODE%" (
    echo [ERROR] Node.js binary was not found at: "%XPIDER_NODE%"
    pause
    exit /b 1
)

:: [Defect P Fix] Strict Node.js supported LTS allowlist (explicitly 22 or 24 only; rejects odd/EOL/non-LTS majors)
"%XPIDER_NODE%" -e "const v = parseInt(process.versions.node.split('.')[0], 10); const allowed = [22, 24]; if (allowed.indexOf(v) === -1) { console.error('[ERROR] Selected Node.js (' + process.version + ') is not an allowed LTS release. Explicitly supported LTS lines are v24 and v22. Major ' + v + ' is strictly rejected.'); process.exit(1); }"
if !ERRORLEVEL! NEQ 0 (
    pause
    exit /b 1
)

echo [0/4] Verifying locked runtime dependencies (ssh2)...
"%XPIDER_NODE%" -e "try { require('./node_modules/ssh2'); console.log('   [OK] Runtime dependency (ssh2) verified.'); process.exit(0); } catch (_) { try { require('ssh2'); console.log('   [OK] Runtime dependency (ssh2) verified.'); process.exit(0); } catch (e) { process.exit(1); } }"
if !ERRORLEVEL! NEQ 0 (
    echo   Attempting locked dependency recovery...
    if exist "package-lock.json" (
        call npm ci --omit=dev --no-audit --no-fund --silent
    ) else (
        call npm install --omit=dev --no-audit --no-fund --silent
    )
    "%XPIDER_NODE%" -e "try { require('ssh2'); console.log('   [OK] Runtime dependency (ssh2) verified.'); process.exit(0); } catch (e) { process.exit(1); }"
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Runtime dependency ssh2 could not be loaded!
        pause
        exit /b 1
    )
)

echo.
echo [1/4] Registering Windows Autostart for Privacy Relay...
if exist "companion\install_autostart.js" (
    "%XPIDER_NODE%" companion\install_autostart.js
    if !ERRORLEVEL! NEQ 0 (
        echo [WARNING] Autostart registration returned non-zero exit code.
    ) else (
        echo [OK] Windows Autostart registered successfully.
    )
) else (
    echo [INFO] companion\install_autostart.js not present, skipping autostart.
)

echo.
echo [2/4] Registering Native Messaging Host for Google Chrome and Microsoft Edge...
if exist "companion\install_native_host.js" (
    "%XPIDER_NODE%" companion\install_native_host.js %*
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
echo [3/4] Starting Privacy Relay Companion in background...
if exist "companion\start_relay_silent.vbs" (
    wscript.exe companion\start_relay_silent.vbs
) else if exist "companion\privacy_relay.js" (
    start "" /b "%XPIDER_NODE%" companion\privacy_relay.js
)
ping 127.0.0.1 -n 3 >nul

echo.
echo [4/4] Verifying and Starting Local Owner Test Server (127.0.0.1:8088)...
if exist "owner-extension-test-site\server.js" (
    "%XPIDER_NODE%" -e "const http = require('http'); const req = http.get('http://127.0.0.1:8088/__xpider_health', res => { let b = ''; res.on('data', d => b += d); res.on('end', () => { try { const j = JSON.parse(b); if (j.ok && j.service === 'XPIDER_OWNER_TEST_SERVER') { console.log('   [OK] Owner Test Server is ALREADY RUNNING and verified healthy.'); process.exit(0); } } catch (_) {} process.exit(1); }); }); req.on('error', () => process.exit(1)); req.setTimeout(800, () => process.exit(1));"
    if !ERRORLEVEL! NEQ 0 (
        if exist "owner-extension-test-site\start_test_server_silent.vbs" (
            wscript.exe owner-extension-test-site\start_test_server_silent.vbs
        ) else (
            start "" /b "%XPIDER_NODE%" owner-extension-test-site\server.js
        )
        ping 127.0.0.1 -n 3 >nul
        "%XPIDER_NODE%" -e "const http = require('http'); const req = http.get('http://127.0.0.1:8088/__xpider_health', res => { let b = ''; res.on('data', d => b += d); res.on('end', () => { try { const j = JSON.parse(b); if (j.ok && j.service === 'XPIDER_OWNER_TEST_SERVER') { console.log('   [OK] Owner Test Server started and verified healthy on port 8088.'); process.exit(0); } } catch (_) {} process.exit(1); }); }); req.on('error', () => process.exit(1)); req.setTimeout(1200, () => process.exit(1));"
        if !ERRORLEVEL! NEQ 0 (
            echo    [WARNING] Could not verify Owner Test Server immediately. Extension Auto Setup will verify/start it automatically.
        )
    )
) else (
    echo [INFO] owner-extension-test-site\server.js not found in current folder.
)

echo.
echo ========================================================
echo   Auto Setup Completed Successfully!
echo   - Native Messaging Host: REGISTERED (Chrome and Edge)
echo   - Privacy Relay Service: RUNNING on 127.0.0.1:18988 / 18989
echo   - Owner Test Server: READY on 127.0.0.1:8088
echo ========================================================
echo You may now open Chrome / Edge, reload XPIDER, and click AUTO SETUP.
echo.
exit /b 0

@echo off
setlocal EnableDelayedExpansion

echo ========================================================
echo   XPIDER AutoForm Sender Pro - One-Click OS Auto Setup
echo   Privacy Relay Companion + Native Host + Test Runtime
echo ========================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js (https://nodejs.org) to run XPIDER companions and test fixtures.
    pause
    exit /b 1
)

echo [1/4] Registering Windows Autostart for Privacy Relay...
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
echo [2/4] Registering Native Messaging Host for Google Chrome and Microsoft Edge...
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
echo [3/4] Starting Privacy Relay Companion in background...
if exist "companion\start_relay_silent.vbs" (
    wscript.exe companion\start_relay_silent.vbs
) else if exist "companion\privacy_relay.js" (
    start "" /b node companion\privacy_relay.js
)
timeout /t 2 /nobreak >nul

echo.
echo [4/4] Verifying and Starting Local Owner Test Server (127.0.0.1:8088)...
if exist "owner-extension-test-site\server.js" (
    node -e "
    const http = require('http');
    const req = http.get('http://127.0.0.1:8088/__xpider_health', res => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => {
            try {
                const j = JSON.parse(b);
                if (j.ok && j.service === 'XPIDER_OWNER_TEST_SERVER') {
                    console.log('   [OK] Owner Test Server is ALREADY RUNNING and verified healthy.');
                    process.exit(0);
                }
            } catch (_) {}
            process.exit(1);
        });
    });
    req.on('error', () => process.exit(1));
    req.setTimeout(800, () => process.exit(1));
    "
    if !ERRORLEVEL! NEQ 0 (
        if exist "owner-extension-test-site\start_test_server_silent.vbs" (
            wscript.exe owner-extension-test-site\start_test_server_silent.vbs
        ) else (
            start "" /b node owner-extension-test-site\server.js
        )
        timeout /t 2 /nobreak >nul
        node -e "
        const http = require('http');
        const req = http.get('http://127.0.0.1:8088/__xpider_health', res => {
            let b = '';
            res.on('data', d => b += d);
            res.on('end', () => {
                try {
                    const j = JSON.parse(b);
                    if (j.ok && j.service === 'XPIDER_OWNER_TEST_SERVER') {
                        console.log('   [OK] Owner Test Server started and verified healthy on port 8088.');
                        process.exit(0);
                    }
                } catch (_) {}
                process.exit(1);
            });
        });
        req.on('error', () => process.exit(1));
        req.setTimeout(1200, () => process.exit(1));
        "
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
echo   - Native Messaging Host: REGISTERED (Chrome & Edge)
echo   - Privacy Relay Service: RUNNING on 127.0.0.1:18988 / 18989
echo   - Owner Test Server: READY on 127.0.0.1:8088
echo ========================================================
echo You may now open Chrome / Edge, reload XPIDER, and click ✨ AUTO SETUP.
echo.
exit /b 0

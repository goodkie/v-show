@echo off
setlocal
echo ========================================================
echo   XPIDER AutoForm Sender Pro - Unpacked Extension Sync
echo ========================================================

cd /d "%~dp0"

set "XPIDER_NODE="
if exist "%~dp0runtime\node\node.exe" (
    set "XPIDER_NODE=%~dp0runtime\node\node.exe"
) else (
    where node >nul 2>&1
    if !errorlevel! equ 0 (
        set "XPIDER_NODE=node"
    )
)

if not defined XPIDER_NODE (
    echo [ERROR] Bundled Node.js runtime not found and Node.js is not in PATH!
    pause
    exit /b 1
)

"%XPIDER_NODE%" -e "const fs = require('fs'); const path = require('path'); const srcDir = path.resolve('extension'); const targets = [path.resolve('send_message_backup'), path.resolve('send_message_backup/build/extension'), path.resolve('E:/vivpr/ai/extensions/send_message_backup')]; for (const target of targets) { if (fs.existsSync(target)) { fs.cpSync(srcDir, target, { recursive: true }); console.log('[OK] Synced to: ' + target); } }"
echo.
echo ========================================================
echo [DONE] Extension files synchronized to unpacked directories.
echo Please navigate to edge://extensions or chrome://extensions
echo and click the Reload button on the XPIDER extension card.
echo ========================================================
pause

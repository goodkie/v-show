@echo off
chcp 65001 >nul
setlocal
set "BASE_DIR=%~dp0"

echo ========================================================================
echo   XPIDER AUTOFORM SENDER PRO — FIREWALL IP GUARDIAN
echo ========================================================================
echo.

if exist "%BASE_DIR%runtime\node\node.exe" (
    set "XPIDER_NODE=%BASE_DIR%runtime\node\node.exe"
) else (
    set "XPIDER_NODE=node"
)

"%XPIDER_NODE%" "%BASE_DIR%scripts\quick_update_firewall_ip.js" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
    echo [OK] Execution finished successfully.
) else (
    echo [NOTICE] Script exited with code %EXIT_CODE%.
)
echo.
pause
exit /b %EXIT_CODE%

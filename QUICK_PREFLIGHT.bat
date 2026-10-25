@echo off
setlocal EnableDelayedExpansion

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
    echo [ERROR] Node.js runtime not found in bundled path or system PATH!
    pause
    exit /b 1
)

"%XPIDER_NODE%" scripts\owner_local_preflight.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [PREFLIGHT] Diagnostic encountered an issue.
    pause
    exit /b 1
)

if "%1" neq "--silent" (
    echo.
    pause
)
exit /b 0

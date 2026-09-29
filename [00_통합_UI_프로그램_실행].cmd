@echo off
chcp 65001 >nul
title AGY-Sync Master Launcher

set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%tools\agy-sync-master\AGY-Sync-Master.cmd" (
    call "%SCRIPT_DIR%tools\agy-sync-master\AGY-Sync-Master.cmd"
) else if exist "%SCRIPT_DIR%AGY-Sync-Master.cmd" (
    call "%SCRIPT_DIR%AGY-Sync-Master.cmd"
) else (
    echo [ERROR] AGY-Sync-Master.cmd 를 찾을 수 없습니다.
    pause
    exit /b 1
)

if %ERRORLEVEL% neq 0 pause

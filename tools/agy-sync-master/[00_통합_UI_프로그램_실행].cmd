@echo off
chcp 65001 >nul
call "%~dp0AGY-Sync-Master.cmd"
if %ERRORLEVEL% neq 0 pause

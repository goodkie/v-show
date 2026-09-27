@echo off
cd /d "%~dp0"
start "" powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "%~dp0sync_scripts\VShowSync_Manager.ps1"

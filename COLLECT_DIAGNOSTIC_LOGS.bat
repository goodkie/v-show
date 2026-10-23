@echo off
setlocal
REM XPIDER AutoForm Sender Pro -- Anonymized Log and Evidence Collector
REM Calls scripts\collect_diagnostic_logs.ps1 for full logic

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\collect_diagnostic_logs.ps1"
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Log collection failed with exit code: %ERRORLEVEL%
  pause
  exit /b %ERRORLEVEL%
) else (
  echo [OK] Diagnostic logs packaged successfully.
)
endlocal
pause

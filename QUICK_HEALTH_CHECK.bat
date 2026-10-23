@echo off
setlocal
REM XPIDER AutoForm Sender Pro -- 1-Click Health and Connectivity Check
REM Tests: Guardian DPAPI, Port 8443 open, Port 22 blocked, live egress probe
REM Regression: checks for legacy 'tlocal'/'cho'/'9009' errors

echo ====================================================
echo  XPIDER AutoForm Sender Pro RC3.45 Health Check
echo ====================================================

node "%~dp0scripts\owner_quick_check.js"
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Health check reported errors. Exit code: %ERRORLEVEL%
  echo         Possible regressions: check for 'tlocal', 'cho', '9009' errors above.
  pause
  exit /b %ERRORLEVEL%
) else (
  echo.
  echo [OK] All checks completed successfully. No regression errors detected.
)
endlocal
pause

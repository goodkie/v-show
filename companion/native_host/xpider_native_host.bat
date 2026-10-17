@echo off
setlocal
if exist "%~dp0..\..\runtime\node\node.exe" (
    "%~dp0..\..\runtime\node\node.exe" "%~dp0xpider_native_host.js"
) else if exist "%~dp0..\runtime\node\node.exe" (
    "%~dp0..\runtime\node\node.exe" "%~dp0xpider_native_host.js"
) else (
    node "%~dp0xpider_native_host.js"
)

@echo off
setlocal
cd /d "%~dp0"
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "PS=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" (
 echo Windows PowerShell 5.1 is required.
 pause
 exit /b 1
)
"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Build-App.ps1"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" echo Read build-gui.log in this folder.
pause
exit /b %RC%

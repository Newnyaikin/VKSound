@echo off
setlocal
cd /d "%~dp0"
if not exist "artifacts\win-unpacked\VKSound.exe" (
 echo Run Build-App.cmd first. This is source code, not a prebuilt EXE.
 pause
 exit /b 1
)
start "" "%~dp0artifacts\win-unpacked\VKSound.exe"

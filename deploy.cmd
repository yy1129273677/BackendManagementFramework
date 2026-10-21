@echo off
setlocal

REM =============================================================================
REM deploy.cmd - wrapper for deploy-images.ps1
REM
REM Why this wrapper exists:
REM   This project lives on the E: drive, and PowerShell's zone check treats files
REM   on that drive as "remote". Under the RemoteSigned execution policy an
REM   unsigned .ps1 is therefore rejected ("not digitally signed"), even though
REM   the file is local. Starting a child PowerShell with -ExecutionPolicy Bypass
REM   only affects this single run and does not change any system setting.
REM
REM Usage (arguments are passed through unchanged):
REM   deploy.cmd                  update server + web
REM   deploy.cmd -Only server     update server only
REM   deploy.cmd -Only web        update web only
REM   deploy.cmd -SkipBuild       upload current images without rebuilding
REM
REM Note: messages are English on purpose. A .cmd file is parsed with the system
REM code page (GBK on Chinese Windows), so non-ASCII text would be garbled.
REM =============================================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-images.ps1" %*
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
  echo.
  echo [deploy.cmd] FAILED, exit code %RC%
)

echo.
pause
exit /b %RC%

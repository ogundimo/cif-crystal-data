@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
set "PATH=%~dp0.tools\npm\bin;%PATH%"
node "%~dp0.tools\npm\bin\npm-cli.js" %*
exit /b %errorlevel%

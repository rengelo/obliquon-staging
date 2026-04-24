@echo off
set PYTHON=C:\Users\renat\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
if not exist "%PYTHON%" (
  echo Bundled Python runtime not found: %PYTHON%
  exit /b 1
)
cd /d "%~dp0"
"%PYTHON%" -m http.server 8123 --bind 127.0.0.1

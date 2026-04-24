$python = "C:\Users\renat\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (-not (Test-Path $python)) {
  throw "Bundled Python runtime not found: $python"
}

Set-Location $PSScriptRoot
& $python -m http.server 8123 --bind 127.0.0.1

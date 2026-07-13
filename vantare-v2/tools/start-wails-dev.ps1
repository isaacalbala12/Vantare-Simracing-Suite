$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

# Avoid duplicate dev stacks fighting over :9245 and restarting vantare.exe in a loop.
$existing = Get-Process vantare, wails3 -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Stopping existing Vantare/Wails processes..."
  $existing | Stop-Process -Force
  Start-Sleep -Seconds 2
}

$env:VANTARE_SUPABASE_URL = "https://ombjshwzqgeisazijduq.supabase.co"
$anonLine = Get-Content "frontend\.env.local" | Where-Object { $_ -match '^VITE_SUPABASE_ANON_KEY=' } | Select-Object -First 1
if (-not $anonLine) {
  throw "VITE_SUPABASE_ANON_KEY missing in frontend/.env.local"
}
$env:VANTARE_SUPABASE_ANON_KEY = $anonLine -replace '^VITE_SUPABASE_ANON_KEY=', ''

& powershell -NoProfile -ExecutionPolicy Bypass -File "tools\generate_supabase_config.ps1"
& wails3 dev -config ./build/config.yml -port 9245
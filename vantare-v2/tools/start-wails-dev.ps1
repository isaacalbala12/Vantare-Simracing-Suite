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

# Registro de claves publicas de licencia: "key-id:base64url" separadas por coma.
# Es material publico (no la privada), asi que puede vivir en .env.local.
# Opcional a proposito: sin el, el resto de la app arranca igual, pero el
# verifier queda nil y la validacion de licencia responde "unconfigured".
$keysLine = Get-Content "frontend\.env.local" | Where-Object { $_ -match '^VANTARE_LICENSE_PUBLIC_KEYS=' } | Select-Object -First 1
if ($keysLine) {
  $env:VANTARE_LICENSE_PUBLIC_KEYS = $keysLine -replace '^VANTARE_LICENSE_PUBLIC_KEYS=', ''
} else {
  Write-Host "VANTARE_LICENSE_PUBLIC_KEYS ausente en frontend/.env.local: la validacion de licencia dira 'unconfigured'."
}

& powershell -NoProfile -ExecutionPolicy Bypass -File "tools\generate_supabase_config.ps1"
& wails3 dev -config ./build/config.yml -port 9245
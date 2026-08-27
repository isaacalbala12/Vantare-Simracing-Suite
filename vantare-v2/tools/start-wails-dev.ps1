$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$devPort = 9245

# Avoid duplicate dev stacks fighting over the dev port and restarting
# vantare.exe in a loop.
$existing = Get-Process vantare, wails3 -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Stopping existing Vantare/Wails processes..."
  $existing | Stop-Process -Force
  Start-Sleep -Seconds 2
}

# `wails3 dev` sirve el frontend desde un hijo `node` con Vite, y ese hijo
# sobrevive a la muerte de wails3: matar vantare/wails3 no libera el puerto. El
# arranque siguiente moria con "bind: Only one usage of each socket address" y
# habia que buscar el PID a mano. Solo se cierra si quien lo ocupa es parte de
# este stack; cualquier otra cosa se nombra y se para, en vez de matar a ciegas
# un proceso ajeno que resulte estar en el mismo puerto.
$listener = Get-NetTCPConnection -LocalPort $devPort -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($listener) {
  $owner = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  if (-not $owner) {
    Write-Host "Port $devPort was held by a process that is already gone."
  } elseif ($owner.ProcessName -in @("node", "wails3", "vantare")) {
    Write-Host "Freeing port $devPort held by $($owner.ProcessName) (PID $($owner.Id))..."
    Stop-Process -Id $owner.Id -Force
    Start-Sleep -Seconds 1
  } else {
    throw "Port $devPort is held by $($owner.ProcessName) (PID $($owner.Id)); close it before starting the dev stack."
  }
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
& wails3 dev -config ./build/config.yml -port $devPort
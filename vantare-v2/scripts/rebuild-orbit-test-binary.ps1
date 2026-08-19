# Reconstruye el binario de prueba de Orbit siguiendo el Metodo C de
# docs/tester-build-instructions.md (frontend con VITE_ORBIT_DEFAULT=1 +
# credenciales Supabase embebidas desde frontend/.env.local).
param([switch]$SkipFrontend)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not $SkipFrontend) {
  $env:VITE_ORBIT_DEFAULT = '1'
  corepack pnpm --dir frontend build
  if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }
}

$envFile = Get-Content frontend\.env.local | Where-Object { $_ -match '^\s*VITE_SUPABASE_' }
foreach ($line in $envFile) {
  $parts = $line -split '=', 2
  if ($parts.Count -eq 2) {
    if ($parts[0].Trim() -eq 'VITE_SUPABASE_URL') { $env:VANTARE_SUPABASE_URL = $parts[1].Trim() }
    if ($parts[0].Trim() -eq 'VITE_SUPABASE_ANON_KEY') { $env:VANTARE_SUPABASE_ANON_KEY = $parts[1].Trim() }
  }
}

powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\generate_supabase_config.ps1 -OutFile .\cmd\vantare\supabase_build.go
try {
  go build -tags production -trimpath -buildvcs=false -ldflags "-w -s -H windowsgui" -o .\bin\vantare.exe .\cmd\vantare
  if ($LASTEXITCODE -ne 0) { throw "go build failed" }
} finally {
  Remove-Item .\cmd\vantare\supabase_build.go -ErrorAction SilentlyContinue
}
Write-Output "ok: bin\vantare.exe"

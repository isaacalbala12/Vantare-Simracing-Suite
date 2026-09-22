param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repoRoot

# This process never reads .env files. Vite's localdev mode disables envDir.
$env:VITE_RUNTIME_MOCK = ''
$env:VITE_SUPABASE_URL = ''
$env:VITE_SUPABASE_ANON_KEY = ''

pnpm --dir frontend exec tsc -b
if ($LASTEXITCODE -ne 0) { throw 'Frontend typecheck/build failed.' }
pnpm --dir frontend exec vite build --mode localdev
if ($LASTEXITCODE -ne 0) { throw 'Frontend local-development bundle failed.' }

New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot 'bin') | Out-Null
go build -tags vantare_localdev -trimpath -buildvcs=false -ldflags '-H windowsgui' -o bin/vantare-localdev.exe ./cmd/vantare
if ($LASTEXITCODE -ne 0) { throw 'Local-development executable failed.' }

Write-Output 'bin/vantare-localdev.exe'

[CmdletBinding(DefaultParameterSetName = 'File')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'File')]
    [string]$EnvFile,
    [Parameter(Mandatory = $true, ParameterSetName = 'Environment')]
    [switch]$FromEnvironment,
    [string]$OutFile = 'bin/vantare-measurement.exe',
    [ValidateSet('master', 'nightly', 'testers')]
    [string]$BuildChannel = 'master',
    [switch]$ReadableFrontend
)

$ErrorActionPreference = 'Stop'
$BuildChannel = $BuildChannel.ToLowerInvariant()
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$envPath = if ($PSCmdlet.ParameterSetName -eq 'File') { (Resolve-Path -LiteralPath $EnvFile).Path } else { $null }
$outPath = if ([IO.Path]::IsPathRooted($OutFile)) { $OutFile } else { Join-Path $repoRoot $OutFile }
$generatedPath = Join-Path $repoRoot 'cmd\vantare\supabase_build.go'
if (Test-Path -LiteralPath $generatedPath) {
    throw 'Ya existe supabase_build.go; conserva o retira ese artefacto antes de construir.'
}
$names = @(
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VANTARE_SUPABASE_URL',
    'VANTARE_SUPABASE_ANON_KEY',
    'VANTARE_LICENSE_PUBLIC_KEYS'
)
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

try {
    $values = @{}
    if ($PSCmdlet.ParameterSetName -eq 'Environment') {
        # Reutiliza la configuracion publica ya inyectada; no abre ficheros .env.
        foreach ($file in @('.env', '.env.local', '.env.production', '.env.production.local')) {
            if (Test-Path -LiteralPath (Join-Path $repoRoot "frontend/$file")) {
                throw 'FromEnvironment requiere frontend sin archivos de entorno que Vite pueda cargar.'
            }
        }
        foreach ($suffix in @('URL', 'ANON_KEY')) {
            $backend = [Environment]::GetEnvironmentVariable("VANTARE_SUPABASE_$suffix", 'Process')
            $frontend = [Environment]::GetEnvironmentVariable("VITE_SUPABASE_$suffix", 'Process')
            if ($backend -and $frontend -and $backend -cne $frontend) {
                throw "Configuracion distinta entre VANTARE_SUPABASE_$suffix y VITE_SUPABASE_$suffix."
            }
            $values["VITE_SUPABASE_$suffix"] = if ($backend) { $backend } else { $frontend }
        }
        $values['VANTARE_LICENSE_PUBLIC_KEYS'] = $env:VANTARE_LICENSE_PUBLIC_KEYS
    } else {
        foreach ($line in Get-Content -LiteralPath $envPath) {
            if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { continue }
            $name = $Matches[1]
            if ($name -notin $names) { continue }
            $value = $Matches[2].Trim()
            if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[-1] -eq '"') -or ($value[0] -eq "'" -and $value[-1] -eq "'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $values[$name] = $value
        }
    }
    foreach ($required in @('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY')) {
        if (-not $values.ContainsKey($required) -or [string]::IsNullOrWhiteSpace($values[$required])) {
            throw "Falta $required en la configuracion de compilacion."
        }
    }

    $env:VITE_SUPABASE_URL = $values['VITE_SUPABASE_URL']
    $env:VITE_SUPABASE_ANON_KEY = $values['VITE_SUPABASE_ANON_KEY']
    $env:VANTARE_SUPABASE_URL = $values['VITE_SUPABASE_URL']
    $env:VANTARE_SUPABASE_ANON_KEY = $values['VITE_SUPABASE_ANON_KEY']
    if ($values.ContainsKey('VANTARE_LICENSE_PUBLIC_KEYS')) {
        $env:VANTARE_LICENSE_PUBLIC_KEYS = $values['VANTARE_LICENSE_PUBLIC_KEYS']
    }

    Push-Location $repoRoot
    try {
        if ($ReadableFrontend) {
            # Attribution only: this build must not be used as a production A/B result.
            corepack pnpm --dir frontend build --minify false
        } else {
            corepack pnpm --dir frontend build
        }
        if ($LASTEXITCODE -ne 0) { throw "frontend build falló con código $LASTEXITCODE." }
        & powershell -NoProfile -ExecutionPolicy Bypass -File tools\generate_supabase_config.ps1 -OutFile $generatedPath
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $generatedPath)) {
            throw 'generate_supabase_config.ps1 no produjo el fichero Go temporal.'
        }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outPath) | Out-Null
        # El banco necesita el puerto CDP, que está deliberadamente ausente de
        # builds `production`; sigue siendo una build real con frontend y
        # Supabase embebidos, pero conserva solo los ganchos de diagnóstico.
        go build -trimpath -buildvcs=false -ldflags "-w -s -H windowsgui -X main.buildChannel=$BuildChannel" -o $outPath .\cmd\vantare
        if ($LASTEXITCODE -ne 0) { throw "go build falló con código $LASTEXITCODE." }
        $hash = (Get-FileHash -LiteralPath $outPath -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-Host "Build de medida creada: $outPath"
        Write-Host "SHA-256: $hash"
    } finally {
        Pop-Location
    }
} finally {
    Remove-Item -LiteralPath $generatedPath -Force -ErrorAction SilentlyContinue
    foreach ($name in $names) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
}

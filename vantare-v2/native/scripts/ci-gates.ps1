# One queue acquisition, one persistent target, no duplicate workspace check.
# -LintOnly (fmt/clippy/legacy/captura) y -ArchiveOnly (compilar tests) permiten
# repartir el trabajo en dos jobs de CI sin duplicar la selección por diff.
param([string]$DiffBase, [switch]$Telemetry, [switch]$LintOnly, [switch]$ArchiveOnly,
    [ValidateSet('a', 'b')][string]$ArchiveGroup)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($LintOnly -and $ArchiveOnly) { throw 'Elegir -LintOnly o -ArchiveOnly, nunca ambos.' }
if (-not $env:VANTARE_SLOT_TARGET) { throw 'Invocar por compilar.ps1.' }
Push-Location (Split-Path $PSScriptRoot)
try {
    $packages = @()
    $legacyChecks = @()
    if ($DiffBase) {
        $selection = & python (Join-Path $PSScriptRoot 'affected-crates.py') --base $DiffBase --fast
        if ($LASTEXITCODE) { throw 'No se pudo calcular el diff; no se omiten gates.' }
        if ($selection) { $packages = $selection.Split(',') }
        else { Write-Host 'Sin crates nativos afectados.'; return }
        $legacy = & python (Join-Path $PSScriptRoot 'affected-crates.py') --base $DiffBase --legacy-check
        if ($LASTEXITCODE) { throw 'No se pudieron seleccionar consumidores legacy.' }
        if ($legacy) { $legacyChecks = $legacy.Split(',') }
    }
    # TEMP measurement: simulate the --fast scope of a crate PR (Hub/Admin out)
    # even when the diff is global because this branch touches CI files.
    if ($env:VANTARE_FORCE_FAST_SCOPE -eq '1' -and $packages.Count) {
        $packages = @($packages | Where-Object { $_ -notin @('vantare-hub', 'vantare-admin') })
    }
    $fullPackages = @($packages)
    $archivePackages = @($packages)
    $excludePackages = @()
    $useExclude = $false
    if ($ArchiveGroup) {
        $json = & cargo metadata --locked --offline --no-deps --format-version 1
        if ($LASTEXITCODE) { throw 'No se pudo leer el workspace para repartir el archive.' }
        $metadata = $json | ConvertFrom-Json
        $members = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members })
        $byName = @{}
        foreach ($member in $members) { $byName[$member.name] = $member }
        if (-not $fullPackages.Count) { $fullPackages = @($members | ForEach-Object { $_.name }) }
        # Prerrequisitos de proceso que Cargo no modela como dependencia de test.
        if ('vantare-runtime' -cin $fullPackages -and 'vantare-services' -cnotin $fullPackages) {
            $fullPackages += 'vantare-services'
        }
        if ('vantare-hub' -cin $fullPackages -and 'vantare-storage' -cnotin $fullPackages) {
            $fullPackages += 'vantare-storage'
        }
        # Unidades que no se pueden separar: runtime lanza el binario de services;
        # el análisis de hub lanza storage como proceso.
        $cohesive = @(@('vantare-runtime', 'vantare-services'), @('vantare-hub', 'vantare-storage'))
        $units = @()
        $seen = @{}
        foreach ($name in ($fullPackages | Sort-Object)) {
            if ($seen[$name]) { continue }
            $unit = @($name)
            foreach ($group in $cohesive) {
                if ($name -cin $group) { $unit += @($group | Where-Object { $_ -cin $fullPackages }) }
            }
            $unit = @($unit | Sort-Object -Unique)
            foreach ($item in $unit) { $seen[$item] = $true }
            $weight = 0
            foreach ($item in $unit) {
                $weight += @($byName[$item].targets | Where-Object { $_.test -eq $true }).Count
            }
            $units += [pscustomobject]@{ names = $unit; weight = [math]::Max(1, $weight) }
        }
        $a = @(); $b = @(); $wa = 0; $wb = 0
        $ordered = $units | Sort-Object -Property @{ Expression = 'weight'; Descending = $true },
            @{ Expression = { $_.names -join ',' }; Descending = $false }
        foreach ($unit in $ordered) {
            if ($wa -le $wb) { $a += $unit.names; $wa += $unit.weight }
            else { $b += $unit.names; $wb += $unit.weight }
        }
        $groupNames = if ($ArchiveGroup -eq 'a') { $a } else { $b }
        $otherNames = if ($ArchiveGroup -eq 'a') { $b } else { $a }
        $archivePackages = @($groupNames | Sort-Object)
        $outside = @($members | ForEach-Object { $_.name } | Where-Object { $_ -cnotin $fullPackages })
        $excludePackages = @($outside + $otherNames | Sort-Object -Unique)
        $useExclude = $true
        Write-Host "Archive ${ArchiveGroup}: $($archivePackages -join ', ') (pesos $wa/$wb; excluye $($excludePackages -join ', '))"
    }
    Write-Host "Scope: $(if ($archivePackages.Count) { $archivePackages -join ', ' } else { 'workspace completo' })"
    if (-not $ArchiveOnly) {
        & cargo fmt --all -- --check
        if ($LASTEXITCODE) { throw 'Formato nativo.' }
        & (Join-Path $PSScriptRoot '../gates.ps1') -Gate clippy -Packages $packages
        if ($LASTEXITCODE) { throw 'Clippy nativo.' }
        if ($legacyChecks.Count) {
            Write-Host "Compatibilidad legacy (sin tests): $($legacyChecks -join ', ')"
            & (Join-Path $PSScriptRoot '../gates.ps1') -Gate check -Packages $legacyChecks -PublicTargetsOnly
            if ($LASTEXITCODE) { throw 'Check legacy nativo.' }
        }
        if (-not $packages.Count -or 'vantare-ui' -cin $packages -or 'vantare-installer' -cin $packages) {
            & (Join-Path $PSScriptRoot '../gates.ps1') -Gate captura
            if ($LASTEXITCODE) { throw 'Captura nativa.' }
        }
    }
    if (-not $LintOnly) {
        $revision = & git rev-parse HEAD
        if ($LASTEXITCODE) { throw 'No se pudo identificar el build archivado.' }
        $lifecycle = @()
        if ($archivePackages.Count) {
            if ($useExclude) {
                & (Join-Path $PSScriptRoot '../gates.ps1') -Gate archive -ExcludePackages $excludePackages
            } else {
                & (Join-Path $PSScriptRoot '../gates.ps1') -Gate archive -Packages $archivePackages
            }
            if ($LASTEXITCODE) { throw 'Archivo de tests nativo.' }
            $manifest = Join-Path $env:VANTARE_SLOT_TARGET 'debug/ci-lifecycle/manifest.json'
            if (Test-Path -LiteralPath $manifest) {
                $lifecycle = @(Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json)
            }
        } else {
            # Grupo vacío: el consumidor lo salta por `packages`; el archivo debe
            # existir para que el paso de subida no falle.
            New-Item -ItemType File -Force -Path (Join-Path $env:VANTARE_SLOT_TARGET 'nextest-tests.tar.zst') | Out-Null
        }
        [ordered]@{
            revision = $revision
            workspace = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot))
            target = $env:VANTARE_SLOT_TARGET
            telemetry = [bool]$Telemetry
            overlays = (-not $fullPackages.Count -or 'vantare-runtime' -cin $fullPackages)
            lifecycle = ($lifecycle.Count -gt 0)
            packages = $archivePackages
            group = $ArchiveGroup
        } | ConvertTo-Json | Set-Content (Join-Path $env:VANTARE_SLOT_TARGET 'ci-scope.json') -Encoding utf8
    }
} finally { Pop-Location }

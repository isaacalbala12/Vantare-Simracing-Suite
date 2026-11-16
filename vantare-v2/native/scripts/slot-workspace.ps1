# Cargo treats equal package names from different checkouts as the same unit in
# a shared target directory. Before every slot build, compare the content hashes
# of the local inputs with the ones that produced the current artifacts and
# remove (`cargo clean -p`) only the packages whose content changed.
#
# The clean is the persistent invalidation: a cleaned package has no artifact,
# so a partial build that skips it cannot leave a stale executable behind. The
# stamp is written after cleaning and before building; if the build is partial
# or fails, the next run still finds no artifact for the cleaned packages.
. (Join-Path $PSScriptRoot 'target-slot.ps1')

function Get-VantareSlotInputs {
    $path = Join-Path $PSScriptRoot 'slot-inputs.json'
    Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}

function Invoke-VantareGit {
    param([Parameter(Mandatory)][string]$RepoRoot, [Parameter(Mandatory)][string[]]$Arguments)
    $output = & git -C $RepoRoot @Arguments
    if ($LASTEXITCODE) {
        throw "git $($Arguments -join ' ') falló en ${RepoRoot} (código $LASTEXITCODE)."
    }
    $output
}

# Content hashes of every input file, grouped per package plus one external
# group. One `ls-tree`, one `diff --name-status`, one `ls-files` and one
# `hash-object` cover the whole workspace.
function Get-VantareInputHashes {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][object[]]$Packages,
        [Parameter(Mandatory)][string[]]$ExternalPaths
    )
    $inside = & git -C $RepoRoot rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -or $inside -ne 'true') { throw "No es un repositorio git: $RepoRoot" }
    $allPaths = @($Packages | ForEach-Object { $_.path }) + $ExternalPaths
    $allPaths = @($allPaths | Select-Object -Unique)
    $fileHashes = [System.Collections.Generic.Dictionary[string, string]]::new([StringComparer]::Ordinal)

    $raw = Invoke-VantareGit -RepoRoot $RepoRoot -Arguments (@('ls-tree', '-r', '-z', 'HEAD', '--') + $allPaths)
    foreach ($entry in (($raw -join "`n") -split "`0")) {
        if (-not $entry) { continue }
        $parts = $entry -split "`t", 2
        if ($parts.Count -ne 2) { continue }
        $fields = $parts[0] -split ' '
        if ($fields.Count -lt 3 -or $fields[1] -ne 'blob') { continue }
        $fileHashes[$parts[1]] = $fields[2]
    }

    $modified = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $raw = Invoke-VantareGit -RepoRoot $RepoRoot -Arguments (@('diff', '--name-status', '-z', 'HEAD', '--') + $allPaths)
    $fields = (($raw -join "`n") -split "`0")
    $index = 0
    while ($index -lt $fields.Count) {
        $status = $fields[$index]
        if (-not $status) { $index++; continue }
        if ($status[0] -in @('R', 'C')) {
            if ($index + 2 -ge $fields.Count) { throw 'git diff devolvió un rename incompleto.' }
            $old = $fields[$index + 1]
            $new = $fields[$index + 2]
            if ($status[0] -eq 'R') { $fileHashes[$old] = 'deleted' }
            $null = $modified.Add($new)
            $index += 3
        } else {
            if ($index + 1 -ge $fields.Count) { throw 'git diff devolvió una entrada incompleta.' }
            $path = $fields[$index + 1]
            if ($status[0] -eq 'D') { $fileHashes[$path] = 'deleted' }
            else { $null = $modified.Add($path) }
            $index += 2
        }
    }

    $raw = Invoke-VantareGit -RepoRoot $RepoRoot -Arguments (@('ls-files', '-o', '--exclude-standard', '-z', '--') + $allPaths)
    foreach ($path in (($raw -join "`n") -split "`0")) {
        if ($path) { $null = $modified.Add($path) }
    }

    if ($modified.Count) {
        $paths = @($modified)
        $hashes = @($paths | & git -C $RepoRoot hash-object --no-filters --stdin-paths)
        if ($LASTEXITCODE) { throw 'git hash-object falló con los ficheros modificados.' }
        if ($hashes.Count -ne $paths.Count) { throw 'git hash-object devolvió un número inesperado de hashes.' }
        for ($position = 0; $position -lt $paths.Count; $position++) {
            $fileHashes[$paths[$position]] = $hashes[$position]
        }
    }

    function Hash-Lines([string[]]$Lines) {
        if (-not $Lines.Count) { return 'empty' }
        $sorted = [string[]]$Lines.Clone()
        [Array]::Sort($sorted, [StringComparer]::Ordinal)
        $text = $sorted -join "`n"
        return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($text)))
    }

    $packageHashes = [ordered]@{}
    foreach ($package in $Packages) {
        $prefix = $package.path.TrimEnd('/')
        $lines = @()
        foreach ($path in $fileHashes.Keys) {
            if ($path -ceq $prefix -or $path.StartsWith($prefix + '/', [StringComparison]::Ordinal)) {
                $lines += "$path`t$($fileHashes[$path])"
            }
        }
        $packageHashes[$package.name] = Hash-Lines $lines
    }
    $externalLines = @()
    foreach ($path in $fileHashes.Keys) {
        foreach ($root in $ExternalPaths) {
            $prefix = $root.TrimEnd('/')
            if ($path -ceq $prefix -or $path.StartsWith($prefix + '/', [StringComparison]::Ordinal)) {
                $externalLines += "$path`t$($fileHashes[$path])"
                break
            }
        }
    }
    [pscustomobject]@{
        packages = $packageHashes
        external = Hash-Lines $externalLines
    }
}

function Initialize-VantareCargoTag {
    param([Parameter(Mandatory)][string]$Target)
    $tag = Join-Path $Target 'CACHEDIR.TAG'
    if (Test-Path -LiteralPath $tag) { return }
    # The queue owns slot targets and creates them before Cargo, so Cargo never
    # gets the chance to write its own tag. Write the standard signature; only
    # queue stamps, Cargo profiles and known gate outputs are allowed here.
    $allowed = @(
        '.vantare-last-build', '.vantare-workspace', 'tmp', 'debug', 'release', 'prueba', 'ci',
        '.rustc_info.json', '.vantare-target-size.json', 'qa-data', 'nextest-tests.tar.zst',
        'hub-build-tmp', 'cargo-timings', 'rune-measurement-qa')
    $unknown = @(Get-ChildItem -LiteralPath $Target -Force | Where-Object {
        $_.Name -notin $allowed -and $_.Name -notlike 'msvc-probe-*'
    })
    if ($unknown.Count) {
        throw 'Target sin CACHEDIR.TAG con contenido desconocido; no se toca.'
    }
    Set-Content -LiteralPath $tag -Encoding ascii -Value (
        "Signature: 8a477f597d28d172789f06886806bc55`n# Cache directory tag created by the Vantare queue.")
}

function Invoke-VantareCleanPackages {
    param(
        [string[]]$Names = @(),
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][string]$Manifest
    )
    $Names = @($Names)
    if (-not $Names.Count) { return }
    if (-not (Test-Path -LiteralPath (Join-Path $Target 'CACHEDIR.TAG'))) {
        throw 'Target sin CACHEDIR.TAG; no se pueden invalidar paquetes.'
    }
    $profileDirectories = @(Get-ChildItem -LiteralPath $Target -Directory -ErrorAction SilentlyContinue | Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName '.fingerprint')
    })
    foreach ($directory in $profileDirectories) {
        # Cargo's dev profile lives in `debug`; custom profiles keep their name.
        $profile = if ($directory.Name -eq 'debug') { 'dev' } else { $directory.Name }
        $arguments = @('clean', '--manifest-path', $Manifest, '--target-dir', $Target, '--locked', '--offline', '--profile', $profile)
        foreach ($name in $Names) { $arguments += @('-p', $name) }
        & cargo @arguments
        if ($LASTEXITCODE) { throw "No se pudieron limpiar los paquetes en el perfil ${profile}: $($Names -join ', ')." }
    }
    foreach ($directory in $profileDirectories) {
        $fingerprints = Join-Path $directory.FullName '.fingerprint'
        foreach ($name in $Names) {
            $pattern = '^' + [regex]::Escape($name) + '-[0-9a-f]+$'
            $left = @(Get-ChildItem -LiteralPath $fingerprints -Force -ErrorAction SilentlyContinue | Where-Object {
                $_.Name -match $pattern
            })
            if ($left.Count) {
                throw "Quedan artefactos de $name en $($directory.Name)/.fingerprint tras la limpieza."
            }
        }
    }
}

function Set-VantareSlotWorkspace {
    param([Parameter(Mandatory)][string]$Target, [Parameter(Mandatory)][string]$NativeRoot)
    $target = [IO.Path]::GetFullPath($Target)
    $native = [IO.Path]::GetFullPath($NativeRoot)
    $repo = Split-Path (Split-Path $native)
    if (-not (Test-Path -LiteralPath $target)) {
        [IO.Directory]::CreateDirectory($target) | Out-Null
    }
    $slotName = Split-Path $target -Leaf
    # Explicit targets (measurements, QA, packaging) keep their real path and
    # are not shared between checkouts.
    if ($slotName -notmatch '^slot-[01]$') { return }
    Initialize-VantareCargoTag -Target $target

    $manifest = Join-Path $native 'Cargo.toml'
    Push-Location $native
    try {
        $json = & cargo metadata --manifest-path $manifest --no-deps --locked --offline --format-version 1
        if ($LASTEXITCODE) { throw 'No se pudo identificar el workspace del slot.' }
        $metadata = $json | ConvertFrom-Json
        $members = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members })
        $inputs = Get-VantareSlotInputs
        $externalPaths = @($inputs.external) + @($inputs.rootFiles)
        $packages = @($members | ForEach-Object {
                [pscustomobject]@{
                    name = $_.name
                    path = [IO.Path]::GetRelativePath($repo, (Split-Path $_.manifest_path)).Replace('\', '/')
                }
            })
        $hashes = Get-VantareInputHashes -RepoRoot $repo -Packages $packages -ExternalPaths $externalPaths

        $stampPath = Join-Path $target '.vantare-workspace'
        $previous = $null
        if (Test-Path -LiteralPath $stampPath) {
            try { $previous = Get-Content -LiteralPath $stampPath -Raw | ConvertFrom-Json } catch { $previous = $null }
        }
        $changed = @()
        $externalChanged = -not $previous -or -not $previous.PSObject.Properties['external'] -or $previous.external -ne $hashes.external
        foreach ($package in $packages) {
            $old = $null
            if ($previous -and $previous.PSObject.Properties['packages']) {
                $property = $previous.packages.PSObject.Properties[$package.name]
                if ($property) { $old = $property.Value }
            }
            if ($old -ne $hashes.packages[$package.name]) { $changed += $package.name }
        }
        $names = @($changed)
        if ($externalChanged) {
            $names = @($packages | ForEach-Object { $_.name })
            foreach ($name in @($inputs.externalPackages)) { if ($name) { $names += $name } }
        }
        $names = @($names | Select-Object -Unique)
        Invoke-VantareCleanPackages -Names $names -Target $target -Manifest $manifest
        if (@($names).Count) { Write-Host "[cola] paquetes invalidados: $($names -join ', ')" }

        # Safe before the build: cleaned packages have no artifact left.
        [ordered]@{
            packages = $hashes.packages
            external = $hashes.external
        } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stampPath -Encoding utf8
    } finally { Pop-Location }
}

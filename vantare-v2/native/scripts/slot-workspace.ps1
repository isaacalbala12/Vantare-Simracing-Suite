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

# Content hash of a path (file or directory) in the working tree:
#   - committed tree at HEAD (stable across commits with the same content)
#   - uncommitted diff against HEAD (staged and unstaged)
#   - untracked files (path list + bytes)
function Get-VantareContentHash {
    param([Parameter(Mandatory)][string]$RepoRoot, [Parameter(Mandatory)][string[]]$Paths)
    $parts = @()
    foreach ($path in $Paths) {
        $tree = & git -C $RepoRoot rev-parse --verify --quiet "HEAD:$path"
        if ($LASTEXITCODE -or -not $tree) { $tree = 'missing' }
        $diff = & git -C $RepoRoot diff --binary HEAD -- $path | & git hash-object --stdin
        if ($LASTEXITCODE) { throw "No se pudo calcular el contenido de $path." }
        $untracked = @(& git -C $RepoRoot ls-files -o --exclude-standard -- $path)
        $untrackedHash = ''
        if ($untracked.Count) {
            $hashes = @($untracked | & git hash-object --no-filters --stdin-paths)
            if ($LASTEXITCODE) { throw "No se pudo leer un fichero sin seguimiento de $path." }
            $untrackedHash = (($untracked -join "`n") + "`n" + ($hashes -join "`n")) | & git hash-object --stdin
        }
        $parts += "$path`t$tree`t$diff`t$untrackedHash"
    }
    return (($parts -join "`n") | & git hash-object --stdin)
}

function Initialize-VantareCargoTag {
    param([Parameter(Mandatory)][string]$Target)
    $tag = Join-Path $Target 'CACHEDIR.TAG'
    if (Test-Path -LiteralPath $tag) { return }
    # The queue owns slot targets and creates them before Cargo, so Cargo never
    # gets the chance to write its own tag. Write the standard signature; only
    # queue stamps and Cargo's own artifacts are allowed here.
    $allowed = @('.vantare-last-build', '.vantare-workspace', 'tmp', 'debug', 'release', '.rustc_info.json')
    $unknown = @(Get-ChildItem -LiteralPath $Target -Force | Where-Object { $_.Name -notin $allowed })
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
    $arguments = @('clean', '--manifest-path', $Manifest, '--target-dir', $Target, '--locked', '--offline')
    foreach ($name in $Names) { $arguments += @('-p', $name) }
    & cargo @arguments
    if ($LASTEXITCODE) { throw "No se pudieron limpiar los paquetes: $($Names -join ', ')." }
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
        $memberHashes = [ordered]@{}
        foreach ($package in $members) {
            $relative = [IO.Path]::GetRelativePath($repo, (Split-Path $package.manifest_path)).Replace('\', '/')
            $memberHashes[$package.name] = Get-VantareContentHash -RepoRoot $repo -Paths @($relative)
        }
        $externalPaths = @($inputs.external) + @($inputs.rootFiles)
        $externalHash = Get-VantareContentHash -RepoRoot $repo -Paths $externalPaths
    } finally { Pop-Location }

    $stampPath = Join-Path $target '.vantare-workspace'
    $previous = $null
    if (Test-Path -LiteralPath $stampPath) {
        try { $previous = Get-Content -LiteralPath $stampPath -Raw | ConvertFrom-Json } catch { $previous = $null }
    }
    $changed = @()
    $externalChanged = -not $previous -or -not $previous.PSObject.Properties['external'] -or $previous.external -ne $externalHash
    foreach ($package in $members) {
        $old = $null
        if ($previous -and $previous.PSObject.Properties['packages']) {
            $property = $previous.packages.PSObject.Properties[$package.name]
            if ($property) { $old = $property.Value }
        }
        if ($old -ne $memberHashes[$package.name]) { $changed += $package.name }
    }
    $names = @($changed)
    if ($externalChanged) {
        $names = @($members | ForEach-Object { $_.name })
        foreach ($name in @($inputs.externalPackages)) { if ($name) { $names += $name } }
    }
    $names = @($names | Select-Object -Unique)
    Invoke-VantareCleanPackages -Names $names -Target $target -Manifest $manifest
    if (@($names).Count) { Write-Host "[cola] paquetes invalidados: $($names -join ', ')" }

    # Safe before the build: cleaned packages have no artifact left.
    [ordered]@{
        packages = $memberHashes
        external = $externalHash
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stampPath -Encoding utf8
}

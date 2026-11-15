# Cargo keys local packages by their absolute checkout path. Run every slot build
# through a stable per-slot junction and invalidate only the local packages whose
# content changed between the previous checkout and the current one.
. (Join-Path $PSScriptRoot 'target-slot.ps1')
function Set-VantareSlotWorkspace {
    param([Parameter(Mandatory)][string]$Target, [Parameter(Mandatory)][string]$NativeRoot)
    $target = [IO.Path]::GetFullPath($Target)
    $native = [IO.Path]::GetFullPath($NativeRoot)
    $repo = Split-Path (Split-Path $native)
    if (-not (Test-Path -LiteralPath $target)) {
        [IO.Directory]::CreateDirectory($target) | Out-Null
    } elseif (-not (Test-Path -LiteralPath (Join-Path $target 'CACHEDIR.TAG'))) {
        # The queue creates its stamps/tmp before Cargo's first invocation.
        # Cargo refuses clean on that fresh directory; never manufacture its tag.
        $unknown = @(Get-ChildItem -LiteralPath $target -Force | Where-Object {
            $_.Name -notin @('.vantare-last-build', '.vantare-workspace', 'tmp')
        })
        if ($unknown.Count -and -not (Test-VantareCargoCache $target)) {
            throw 'Target sin CACHEDIR.TAG con contenido desconocido; no se limpia.'
        }
    }
    if (Get-ChildItem -LiteralPath $target -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) {
        throw 'Hay enlaces dentro del target; no se invalidan paquetes.'
    }
    $slotName = Split-Path $target -Leaf
    # Explicit targets (measurements, QA, packaging) keep their real path.
    if ($slotName -notmatch '^slot-[01]$') { return $null }
    $workspaceRoot = Join-Path (Split-Path $target) 'slot-workspaces'
    [IO.Directory]::CreateDirectory($workspaceRoot) | Out-Null
    $junction = Join-Path $workspaceRoot $slotName
    # Nested builds already run through the junction: no switch and no clean.
    if ($repo.TrimEnd('\', '/') -ieq $junction.TrimEnd('\', '/') -or
        $repo.StartsWith($junction + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        return $junction
    }
    $current = $null
    if (Test-Path -LiteralPath $junction) {
        $item = Get-Item -LiteralPath $junction -Force
        if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "La ruta del workspace del slot existe y no es un enlace: $junction"
        }
        $current = @($item.Target)[0]
    }
    if (-not ($current -and ([IO.Path]::GetFullPath($current).TrimEnd('\', '/') -ieq $repo.TrimEnd('\', '/')))) {
        if (Test-Path -LiteralPath $junction) {
            # Remove the link only, never its target.
            if ($IsWindows) { & cmd.exe /d /c "rmdir `"$junction`"" | Out-Null }
            else { Remove-Item -LiteralPath $junction -Force }
            if ($LASTEXITCODE) { throw 'No se pudo retirar el enlace del workspace del slot.' }
        }
        if ($IsWindows) {
            New-Item -ItemType Junction -Path $junction -Target $repo | Out-Null
        } else {
            New-Item -ItemType SymbolicLink -Path $junction -Target $repo | Out-Null
        }
    }
    # Invalidate only the local packages whose tree changed since the last checkout.
    $stampPath = Join-Path $target '.vantare-workspace'
    $previous = $null
    if (Test-Path -LiteralPath $stampPath) {
        $raw = Get-Content -LiteralPath $stampPath -Raw
        try {
            $parsed = $raw | ConvertFrom-Json
            if ($parsed.PSObject.Properties['native']) { $previous = [string]$parsed.native }
        } catch { }
        if (-not $previous) { $previous = $raw.Trim() }
    }
    if ($previous -and ([IO.Path]::GetFullPath($previous) -ine $native)) {
        $manifest = Join-Path $native 'Cargo.toml'
        Push-Location $native
        try {
            $json = & cargo metadata --manifest-path $manifest --no-deps --locked --offline --format-version 1
            if ($LASTEXITCODE) { throw 'No se pudo identificar el workspace del slot.' }
            $metadata = $json | ConvertFrom-Json
            $members = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members })
            $changed = @()
            foreach ($package in $members) {
                $relative = [IO.Path]::GetRelativePath($native, (Split-Path $package.manifest_path))
                $old = Join-Path $previous $relative
                $new = Join-Path $native $relative
                if (-not (Test-Path -LiteralPath $old)) { $changed += $package.name; continue }
                & git diff --no-index --quiet -- $old $new
                if ($LASTEXITCODE -ne 0) { $changed += $package.name }
            }
            $vendorOld = Join-Path $previous 'vendor/gpui_windows'
            $vendorNew = Join-Path $native 'vendor/gpui_windows'
            if (Test-Path -LiteralPath (Join-Path $vendorNew 'Cargo.toml')) {
                if (-not (Test-Path -LiteralPath $vendorOld)) {
                    $changed += 'gpui_windows'
                } else {
                    & git diff --no-index --quiet -- $vendorOld $vendorNew
                    if ($LASTEXITCODE -ne 0) { $changed += 'gpui_windows' }
                }
            }
            if ($changed.Count) {
                $clean = @('clean', '--manifest-path', $manifest, '--target-dir', $target, '--locked', '--offline')
                foreach ($name in $changed) { $clean += @('-p', $name) }
                & cargo @clean
                if ($LASTEXITCODE) { throw 'No se pudieron invalidar los paquetes cambiados.' }
                Write-Host "[cola] paquetes cambiados invalidados: $($changed -join ', ')"
            }
        } finally { Pop-Location }
    }
    [ordered]@{ native = $native } | ConvertTo-Json | Set-Content -LiteralPath $stampPath -Encoding utf8
    return $junction
}

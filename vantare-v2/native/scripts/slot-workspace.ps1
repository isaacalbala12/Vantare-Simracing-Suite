# Cargo keys local packages by their absolute checkout path. Run every slot build
# through a stable per-slot junction so switching checkouts only recompiles the
# files that changed; registry/git dependencies stay in the shared target.
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
    # Nested builds already run through the junction.
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
    if ($current -and ([IO.Path]::GetFullPath($current).TrimEnd('\', '/') -ieq $repo.TrimEnd('\', '/'))) {
        return $junction
    }
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
    return $junction
}

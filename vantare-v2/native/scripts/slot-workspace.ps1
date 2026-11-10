# Cargo 1.95 can treat equal package names in different checkouts as fresh.
# Invalidate local packages on a checkout change; keep registry/git dependencies.
function Set-VantareSlotWorkspace {
    param([Parameter(Mandatory)][string]$Target, [Parameter(Mandatory)][string]$NativeRoot)
    $root = [IO.Path]::GetFullPath($NativeRoot)
    $manifest = Join-Path $root 'Cargo.toml'
    $stamp = Join-Path $Target '.vantare-workspace'
    if ((Test-Path -LiteralPath $stamp) -and
        [IO.File]::ReadAllText($stamp) -ceq $root) { return }
    if (-not (Test-Path -LiteralPath (Join-Path $Target 'CACHEDIR.TAG'))) {
        # The queue creates its stamps/tmp before Cargo's first invocation.
        # Cargo refuses clean on that fresh directory; never manufacture its tag.
        $unknown = @(Get-ChildItem -LiteralPath $Target -Force | Where-Object {
            $_.Name -notin @('.vantare-last-build', '.vantare-workspace', 'tmp')
        })
        if ($unknown.Count) { throw 'Target sin CACHEDIR.TAG con contenido desconocido; no se limpia.' }
        [IO.File]::WriteAllText($stamp, $root)
        return
    }
    $json = & cargo metadata --manifest-path $manifest --no-deps --locked --offline --format-version 1
    if ($LASTEXITCODE) { throw 'No se pudo identificar el workspace del slot.' }
    $metadata = $json | ConvertFrom-Json
    $packages = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members } | ForEach-Object name)
    if (Test-Path -LiteralPath (Join-Path $root 'vendor/gpui_windows/Cargo.toml')) { $packages += 'gpui_windows' }
    $clean = @('clean', '--manifest-path', $manifest, '--target-dir', $Target, '--locked', '--offline')
    foreach ($package in $packages) { $clean += @('-p', $package) }
    & cargo @clean
    if ($LASTEXITCODE) { throw 'No se pudieron invalidar los paquetes locales del checkout anterior.' }
    [IO.Directory]::CreateDirectory($Target) | Out-Null
    [IO.File]::WriteAllText($stamp, $root)
    Write-Host '[cola] checkout nuevo: paquetes locales invalidados; dependencias conservadas.'
}

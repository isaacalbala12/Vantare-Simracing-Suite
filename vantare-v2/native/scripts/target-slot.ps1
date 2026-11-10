# Called only while compilar.ps1 owns the corresponding global slot mutex.
function Get-VantareTargetRoot {
    if ($env:RUNNER_ENVIRONMENT -eq 'github-hosted') {
        return [IO.Path]::GetFullPath((Join-Path $env:RUNNER_TEMP 'vantare-targets'))
    }
    $configured = $env:VANTARE_TARGET_ROOT
    if (-not $configured -and $IsWindows) { $configured = [Environment]::GetEnvironmentVariable('VANTARE_TARGET_ROOT', 'Machine') }
    if (-not $configured) { $configured = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Vantare/targets' }
    if (-not [IO.Path]::IsPathRooted($configured)) { throw 'VANTARE_TARGET_ROOT debe ser absoluto.' }
    return [IO.Path]::GetFullPath($configured)
}

function Test-VantareTargetPath([string]$Path) {
    if (-not [IO.Path]::IsPathRooted($Path)) { return $false }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    if ($full.Length -le 3) { return $false }
    if ($env:RUNNER_ENVIRONMENT -eq 'github-hosted' -and $env:RUNNER_TEMP) {
        $temporary = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
        return $full.StartsWith($temporary, [StringComparison]::OrdinalIgnoreCase)
    }
    return [IO.Path]::GetPathRoot($full) -ieq [IO.Path]::GetPathRoot((Get-VantareTargetRoot))
}
function Initialize-VantareSlotTarget {
    param(
        [Parameter(Mandatory)][ValidateRange(0, 1)][int]$Slot,
        [string]$Root = (Get-VantareTargetRoot),
        [switch]$Ci
    )
    if (-not (Test-VantareTargetPath $Root)) { throw 'Raíz de targets inválida.' }
    $root = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $name = if ($Ci) { "ci" } else { "slot-$Slot" }
    $target = [IO.Path]::GetFullPath((Join-Path $root $name))
    if ($target -cne (Join-Path $root $name)) { throw 'Ruta de slot inválida.' }
    [IO.Directory]::CreateDirectory($target) | Out-Null
    # Never follow junctions or remove an arbitrary directory masquerading as a target.
    if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'El target de slot no puede ser un enlace.'
    }
    $stamp = Join-Path $target '.vantare-last-build'
    $tag = Join-Path $target 'CACHEDIR.TAG'
    $expired = (Test-Path -LiteralPath $stamp) -and
        (Get-Item -LiteralPath $stamp).LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-14)
    $bytes = 0L
    if (Test-Path -LiteralPath $tag) {
        $items = @(Get-ChildItem -LiteralPath $target -Recurse -Force -ErrorAction Stop)
        if ($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) {
            throw 'Hay enlaces dentro del target; revisar antes de limpiar.'
        }
        foreach ($file in $items | Where-Object { -not $_.PSIsContainer }) { $bytes += $file.Length }
        if ($expired -or $bytes -gt $(if ($Ci) { 35GB } else { 20GB })) {
            $locks = @()
            try {
                foreach ($file in $items | Where-Object Name -EQ '.cargo-lock') {
                    $locks += [IO.File]::Open($file.FullName, 'Open', 'ReadWrite', 'None')
                }
            } catch {
                foreach ($lock in $locks) { $lock.Dispose() }
                throw 'Target ocupado por otro Cargo; no se limpia.'
            }
            foreach ($lock in $locks) { $lock.Dispose() }
            # Absolute path and all descendants checked above; mutex excludes other slot users.
            Get-ChildItem -LiteralPath $target -Force | Remove-Item -Recurse -Force
            Write-Host "[cola] $name limpiado (14 días sin uso o límite de tamaño excedido)."
        }
    }
    $minimum = if ($env:RUNNER_ENVIRONMENT -eq 'github-hosted') { 2GB } else { 15GB }
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($target))
    if ($drive.AvailableFreeSpace -lt $minimum) { throw "El volumen del target tiene menos de $($minimum / 1GB) GB libres." }
    [IO.File]::WriteAllText($stamp, [DateTime]::UtcNow.ToString('O'))
    Write-Host "[cola] target persistente: $target"
    return $target
}

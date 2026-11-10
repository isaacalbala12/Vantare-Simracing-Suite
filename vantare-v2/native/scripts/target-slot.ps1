# Called only while compilar.ps1 owns the corresponding global slot mutex.
function Initialize-VantareSlotTarget {
    param(
        [Parameter(Mandatory)][ValidateRange(0, 1)][int]$Slot,
        [string]$Root = 'D:\VantareServer\targets',
        [switch]$Ci
    )
    if ($Root -notmatch '^[dD]:[\\/]' -or $Root.Length -le 3) { throw 'Raíz de targets inválida.' }
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
            Write-Host "[cola] slot-$Slot limpiado (14 días sin uso o más de 20 GB)."
        }
    }
    if ((Get-PSDrive D).Free -lt 15GB) { throw 'D: tiene menos de 15 GB libres.' }
    [IO.File]::WriteAllText($stamp, [DateTime]::UtcNow.ToString('O'))
    Write-Host "[cola] target persistente: $target"
    return $target
}

# La captura reserva los dos huecos de la cola de compilación mientras dura.
# Los mutex son los mismos que usa native/scripts/compilar.ps1; si el proceso
# muere, Windows los abandona y la cola los recupera.
function Enter-HubCompileSlots {
    $mutexes = @()
    try {
        foreach ($name in @('Global\VantareCargoSlot0', 'Global\VantareCargoSlot1')) {
            $mutex = [Threading.Mutex]::new($false, $name)
            try { $null = $mutex.WaitOne() } catch [Threading.AbandonedMutexException] { }
            $mutexes += $mutex
        }
        return ,$mutexes
    } catch {
        foreach ($mutex in $mutexes) {
            try { $mutex.ReleaseMutex() } catch { }
            $mutex.Dispose()
        }
        throw
    }
}
function Exit-HubCompileSlots($Mutexes) {
    if (-not $Mutexes) { return }
    foreach ($mutex in $Mutexes) {
        try { $mutex.ReleaseMutex() } catch { }
        $mutex.Dispose()
    }
}
function Enter-HubCaptureTurn([string]$Scene) {
    $lock='D:\VantareServer\qa\captura.lock'
    while ($true) {
        & cmd.exe /d /c 'mkdir D:\VantareServer\qa\captura.lock 2>nul'
        if ($LASTEXITCODE -eq 0) { break }
        $directory=Get-Item -LiteralPath $lock -ErrorAction SilentlyContinue
        if ($directory -and ((Get-Date)-$directory.LastWriteTime).TotalMinutes -gt 20) {
            $applications=Get-Process -Name electron,vantare-hub,vantare-hub-ui,vantare -ErrorAction SilentlyContinue
            if (-not $applications) {
                if ([IO.Path]::GetFullPath($lock) -ne 'D:\VantareServer\qa\captura.lock') { throw 'Unexpected capture lock' }
                Add-Content -LiteralPath D:/VantareServer/evidence/hub-web/capture-lock-events.log -Value "$(Get-Date -Format o) removed orphan global capture lock older than 20 min; no Electron/Hub process"
                Remove-Item -LiteralPath $lock -Recurse
                continue
            }
        }
        Write-Output "$(Get-Date -Format o) waiting for global capture lock" | Out-Host
        Start-Sleep -Seconds 60
    }
    $lease=@{pid=$PID;nonce=[guid]::NewGuid().ToString('N');started=(Get-Date -Format o);scene=$Scene}
    $lease | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $lock 'owner.json') -Encoding utf8
    try {
        $lease.slots = Enter-HubCompileSlots
    } catch {
        Remove-Item -LiteralPath $lock -Recurse -Force -ErrorAction SilentlyContinue
        throw
    }
    return $lease
}
function Exit-HubCaptureTurn($Lease) {
    $lock='D:\VantareServer\qa\captura.lock'
    try {
        if (Test-Path -LiteralPath (Join-Path $lock 'owner.json')) {
            $owner=Get-Content -LiteralPath (Join-Path $lock 'owner.json') -Raw | ConvertFrom-Json
            if ($owner.nonce -eq $Lease.nonce -and [IO.Path]::GetFullPath($lock) -eq 'D:\VantareServer\qa\captura.lock') {
                Remove-Item -LiteralPath $lock -Recurse
            }
        }
    } finally {
        Exit-HubCompileSlots $Lease.slots
    }
}

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
    return $lease
}
function Exit-HubCaptureTurn($Lease) {
    $lock='D:\VantareServer\qa\captura.lock'
    $owner=Get-Content -LiteralPath (Join-Path $lock 'owner.json') -Raw | ConvertFrom-Json
    if ($owner.nonce -eq $Lease.nonce -and [IO.Path]::GetFullPath($lock) -eq 'D:\VantareServer\qa\captura.lock') { Remove-Item -LiteralPath $lock -Recurse }
}

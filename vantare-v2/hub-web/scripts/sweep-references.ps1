param([Parameter(Mandatory)][string[]]$Scenes,[Parameter(Mandatory)][string]$Output)
$ErrorActionPreference='Stop'
$lock='D:\VantareServer\qa\captura.lock'
$nonce=[guid]::NewGuid().ToString('N')
$env:VANTARE_HUB_QA_ROOT='D:/VantareServer/qa/isa-1995-barrido-paridad'
$env:TEMP='D:/VantareServer/qa/isa-1995-visual/tmp'; $env:TMP=$env:TEMP
foreach ($scene in $Scenes) { foreach ($theme in @('dark','light')) {
    if ($scene -notmatch '^[a-z0-9-]+$') { throw 'Invalid scene' }
    while ($true) {
        & cmd.exe /d /c 'mkdir D:\VantareServer\qa\captura.lock 2>nul'
        if ($LASTEXITCODE -eq 0) { break }
        Write-Output "$(Get-Date -Format o) waiting for global capture lock"
        Start-Sleep -Seconds 60
    }
    try {
        @{pid=$PID;nonce=$nonce;started=(Get-Date -Format o);scene=$scene;theme=$theme} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $lock 'owner.json')
        $directory=Join-Path $Output $theme
        [void][IO.Directory]::CreateDirectory($directory)
        $first=Join-Path $directory "$scene-collapsed.png"
        $other=Join-Path $directory "$scene-expanded.png"
        & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'capture-gpui-bank.ps1') -Scene $scene -Theme $theme -Output $first -OtherSidebarOutput $other *> (Join-Path $directory "$scene.log")
        Write-Output "$(Get-Date -Format o) $scene $theme exit=$LASTEXITCODE"
        # A receipt proves the input event, not that the bank supports toggling.
        # The report author must inspect both images before accepting an expanded reference.
    } finally {
        $owner=Get-Content -LiteralPath (Join-Path $lock 'owner.json') -Raw | ConvertFrom-Json
        if ($owner.nonce -eq $nonce -and [IO.Path]::GetFullPath($lock) -eq 'D:\VantareServer\qa\captura.lock') { Remove-Item -LiteralPath $lock -Recurse }
    }
} }

param(
    [Parameter(Mandatory)][string[]]$Scenes,
    [Parameter(Mandatory)][string]$Output,
    [Parameter(Mandatory)][string]$Binary
)
$ErrorActionPreference = 'Stop'
$lock = 'D:\VantareServer\qa\captura.lock'
$nonce = [guid]::NewGuid().ToString('N')
$env:VANTARE_HUB_UI_BINARY = [IO.Path]::GetFullPath($Binary)
$env:VANTARE_HUB_QA_ROOT = 'D:/VantareServer/qa/isa-1995-barrido-paridad'
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:/VantareServer/tools/playwright-browsers'
$env:BUN_INSTALL_CACHE_DIR = 'D:/VantareServer/cache/bun'
$env:BUN_RUNTIME_TRANSPILER_CACHE_PATH = 'D:/VantareServer/cache/bun-transpiler'
$env:ELECTRON_CACHE = 'D:/VantareServer/cache/electron'
$env:TEMP = 'D:/VantareServer/qa/isa-1995-visual/tmp'
$env:TMP = $env:TEMP
foreach ($scene in $Scenes) {
    if ($scene -notmatch '^[a-z0-9-]+$') { throw 'Invalid scene' }
    $owned = $false
    while (-not $owned) {
        & cmd.exe /d /c 'mkdir D:\VantareServer\qa\captura.lock 2>nul'
        if ($LASTEXITCODE -eq 0) { $owned = $true; break }
        Write-Output "$(Get-Date -Format o) waiting for global capture lock"
        Start-Sleep -Seconds 60
    }
    try {
        @{pid=$PID;nonce=$nonce;started=(Get-Date -Format o);scene=$scene} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $lock 'owner.json')
        $destination = Join-Path $Output $scene
        [void][IO.Directory]::CreateDirectory($destination)
        & node --experimental-strip-types (Join-Path $PSScriptRoot 'visual-diff.ts') --scene $scene --theme both --references D:/VantareServer/evidence/hub-web/referencia-gpui --output $destination --capture-only --capture-sidebar-matrix *> (Join-Path $destination 'capture.log')
        $captureExit = $LASTEXITCODE
        Write-Output "$(Get-Date -Format o) $scene exit=$captureExit"
        if ($captureExit -in @(-1073741819,-2146233082)) { throw "Fatal process exit $captureExit; record and retry this scene once" }
    } finally {
        $owner = Get-Content -LiteralPath (Join-Path $lock 'owner.json') -Raw | ConvertFrom-Json
        if ($owner.nonce -eq $nonce -and [IO.Path]::GetFullPath($lock) -eq 'D:\VantareServer\qa\captura.lock') { Remove-Item -LiteralPath $lock -Recurse }
    }
}

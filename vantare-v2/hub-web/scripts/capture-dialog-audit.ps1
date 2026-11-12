param(
    [Parameter(Mandatory)][ValidateSet('before','after')][string]$Phase,
    [Parameter(Mandatory)][string[]]$Scenes,
    [string]$Binary=(Join-Path $PSScriptRoot '../release/package-qa/vantare-hub-ui-win32-x64/vantare-hub-ui.exe')
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'capture-lock.ps1')
$env:VANTARE_HUB_UI_BINARY=[IO.Path]::GetFullPath($Binary)
$env:VANTARE_HUB_QA_ROOT='D:/VantareServer/qa/isa-1995-dialog-topbar'
$env:VANTARE_DIALOG_AUDIT_ROOT='D:/VantareServer/evidence/hub-web/dialog-topbar'
$env:VANTARE_DIALOG_AUDIT_PHASE=$Phase
$env:PLAYWRIGHT_BROWSERS_PATH='D:/VantareServer/tools/playwright-browsers'
$env:ELECTRON_CACHE='D:/VantareServer/cache/electron'
$env:TEMP='D:/VantareServer/qa/isa-1995-visual/tmp'
$env:TMP=$env:TEMP
foreach($scene in $Scenes) {
    if($scene -notmatch '^dialog-topbar-[a-z-]+$'){throw 'Unknown audit scene name'}
    $lease=Enter-HubCaptureTurn $scene
    try {
        $output=Join-Path $env:VANTARE_DIALOG_AUDIT_ROOT "captures-$Phase/$scene"
        New-Item -ItemType Directory -Path $output -Force|Out-Null
        & node --experimental-strip-types (Join-Path $PSScriptRoot 'visual-diff.ts') --scene $scene --theme both --references D:/VantareServer/evidence/hub-web/referencia-gpui --output $output --capture-only *> (Join-Path $output 'capture.log')
        $code=$LASTEXITCODE
        Write-Output "$(Get-Date -Format o) $scene exit=$code"
        if($code -ne 0){throw "Audit capture failed: $scene ($code); inspect report.json before retrying"}
    } finally {Exit-HubCaptureTurn $lease}
}

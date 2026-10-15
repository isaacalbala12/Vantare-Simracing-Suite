# Escenas de ajustes sobre el renderer productivo, alfa por HWND, un proceso/ventana.
param([Parameter(Mandatory)][string]$Exe,
      [string]$Out=(Join-Path $env:TEMP 'vantare-variants'),
      [ValidateSet('standings','relative','multiclass_relative','head_to_head','broadcast_tower')]
      [string[]]$Folders=@('standings','relative','multiclass_relative','head_to_head','broadcast_tower'))
$ErrorActionPreference='Stop'
$ui=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$Exe=(Resolve-Path -LiteralPath $Exe).Path
[void][IO.Directory]::CreateDirectory([IO.Path]::GetFullPath($Out))
$entries=@()
foreach($folder in $Folders) {
    $scenePath=Join-Path $ui "src/$folder/scenes.json"
    foreach($scene in (Get-Content -Raw -LiteralPath $scenePath | ConvertFrom-Json)) {
        foreach($instance in $scene.layout.instances) {
            $widget=$instance.settings.kind
            $entries+=@{widget=$widget; settings=$instance.settings; scene=(Resolve-Path -LiteralPath (Join-Path (Split-Path $scenePath) $scene.snapshot)).Path; output=[IO.Path]::GetFullPath((Join-Path $Out "$widget-$($scene.name).png"))}
        }
    }
}
$manifest=Join-Path $Out 'capture-batch.json'
ConvertTo-Json -InputObject $entries -Depth 30 | Set-Content -LiteralPath $manifest -Encoding utf8
& $Exe --capture-batch $manifest | Out-Host
if($LASTEXITCODE){throw "Captura de escenas falló: $LASTEXITCODE"}

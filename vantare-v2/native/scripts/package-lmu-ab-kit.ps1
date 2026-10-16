param([string]$TargetDir='C:\VantareServer\targets\isa-1638',[string]$Output='C:\VantareServer\share\kit-ab-lmu',[string]$PresentMon='C:\VantareServer\share\kit-bench\PresentMon.exe',[string]$License='C:\VantareServer\share\kit-bench\licenses\PresentMon-LICENSE.txt')
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot 'lmu-ab-kit'
$sha=(& git -C (Join-Path $PSScriptRoot '../..') rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'No se puede leer el SHA fuente.' }
$stage=Join-Path $Output ('kit-'+(Get-Date -Format yyyyMMdd-HHmmss)+'-'+$sha.Substring(0,9))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
foreach ($file in Get-ChildItem -LiteralPath $source -File) {
    if ($file.Extension -eq '.ps1') {
        [IO.File]::WriteAllText((Join-Path $stage $file.Name),[IO.File]::ReadAllText($file.FullName),[Text.UTF8Encoding]::new($true))
    } elseif ($file.Extension -in @('.py','.txt')) { Copy-Item -LiteralPath $file.FullName -Destination $stage }
}
Copy-Item -LiteralPath (Join-Path $TargetDir 'release\vantare-grabar-lmu-completo.exe') -Destination $stage
Copy-Item -LiteralPath $PresentMon -Destination (Join-Path $stage 'PresentMon.exe')
Copy-Item -LiteralPath $License -Destination (Join-Path $stage 'PresentMon-LICENSE.txt')
$files=@(Get-ChildItem -LiteralPath $stage -File | Sort-Object Name | ForEach-Object { @{name=$_.Name;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} })
$manifest=[ordered]@{schema='vantare.lmu-ab-kit.v1';source_commit=$sha;created_utc=[DateTime]::UtcNow.ToString('o');platform='Windows x64';protocol='C0 60s, A/B/A/B 180s each';presentmon='2.6.0 official CLI already available in kit-bench';presentmon_source='https://github.com/GameTechDev/PresentMon/tree/v2.6.0';files=$files}
[IO.File]::WriteAllText((Join-Path $stage 'manifest.json'),($manifest|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$zip=Join-Path $Output ('kit-ab-lmu-'+$sha.Substring(0,9)+'.zip')
if (Test-Path -LiteralPath $zip) { throw 'Ya existe ZIP para este SHA; no se sobrescribe.' }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Copy-Item -LiteralPath $zip -Destination (Join-Path $Output 'kit-ab-lmu.zip') -Force
$info=Get-Item -LiteralPath $zip
Write-Output "KIT: $zip ($($info.Length) bytes)"
Write-Output "SHA256: $((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant())"
Write-Output "CARPETA: $stage"

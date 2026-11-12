# Invoke this script INSIDE native/scripts/compilar.ps1, from a complete native checkout.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ArtifactDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (Test-Path -LiteralPath 'D:\VantareServer\qa\captura.lock') { throw 'Captura activa; no iniciar compilacion.' }
if (-not $env:VANTARE_CARGO_QUEUE_OWNER -or -not $env:CARGO_TARGET_DIR) { throw 'Usar la cola del repositorio.' }
$target = Join-Path $env:CARGO_TARGET_DIR 'vanta141-carga'
$null = New-Item -ItemType Directory -Path $target -Force
$sha = (& git -C $PSScriptRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE) { throw 'No se puede obtener procedencia.' }
if (@(& git -C $PSScriptRoot status --porcelain).Count) { throw 'Commit antes de compilar.' }
$metadata = [ordered]@{sha=$sha;profile='release';compiler='MSVC C++';options='/O2 /MT /EHsc /std:c++17';graphics_executed=$false}
$json = $metadata | ConvertTo-Json -Compress
[IO.File]::WriteAllText((Join-Path $target 'provenance.h'), "static const char kProvenance[] = R`"json($json)json`";`n")
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$installation = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
if ($LASTEXITCODE -or -not $installation) { throw 'No se encontro MSVC.' }
$dev = Join-Path $installation 'Common7/Tools/VsDevCmd.bat'
$source = Join-Path $PSScriptRoot 'carga.cpp'
$binary = Join-Path $target 'vantare-carga-gpu.exe'
$object = Join-Path $target 'carga.obj'
$command = '""{0}" -no_logo -arch=x64 -host_arch=x64 && cl.exe /nologo /O2 /MT /EHsc /std:c++17 /W4 /I"{1}" /Fo"{2}" /Fe"{3}" "{4}" user32.lib d3d11.lib d3dcompiler.lib dxgi.lib /link /INCREMENTAL:NO"' -f $dev,$target,$object,$binary,$source
$watch = [Diagnostics.Stopwatch]::StartNew()
& $env:ComSpec /d /s /c $command
if ($LASTEXITCODE) { throw "MSVC fallo: $LASTEXITCODE" }
$watch.Stop()
$out = [IO.Path]::GetFullPath($ArtifactDirectory)
if (Test-Path -LiteralPath $out) { throw 'No sobrescribir una entrega anterior.' }
$null = New-Item -ItemType Directory -Path $out
Copy-Item -LiteralPath $binary -Destination $out
$metadata.elapsed_s = $watch.Elapsed.TotalSeconds
$metadata.bytes = (Get-Item -LiteralPath $binary).Length
$metadata.sha256 = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $out 'construccion.json') -Encoding utf8

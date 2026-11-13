[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if (Test-Path -LiteralPath 'D:\VantareServer\qa\captura.lock') { throw 'Captura activa: no iniciar validación.' }
if (-not $env:VANTARE_CARGO_QUEUE_OWNER -or -not $env:CARGO_TARGET_DIR) { throw 'Usar la cola del servidor.' }
if (@(& git -C $PSScriptRoot status --porcelain).Count) { throw 'Commit antes de validar los tipos.' }
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Usar una carpeta de evidencia nueva.' }
$env:TEMP=Join-Path $env:CARGO_TARGET_DIR 'vanta141-validar-tipos'
$env:TMP=$env:TEMP
$null=New-Item -ItemType Directory -Path $env:TEMP -Force
foreach ($name in @('Contadores','Captura','Temperatura')) {
    # Solo compilar. Ningún constructor ni función nativa se invoca.
    Add-Type -Path (Join-Path $PSScriptRoot ($name+'.cs')) -CompilerOptions @('/optimize+','/debug-')
}
if (-not [Vantare141.GpuThermals]::LayoutsMatchSdk()) { throw 'ABI x64 distinta del SDK.' }
$null=New-Item -ItemType Directory -Path $OutputDirectory
[ordered]@{
    source=(& git -C $PSScriptRoot rev-parse HEAD).Trim();compiler='Add-Type Roslyn /optimize+ /debug-'
    result='PASS';abi='x64: 20/16/24/64/40';native_calls=$false;graphics_executed=$false
    files=@(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.cs' | ForEach-Object {
        [ordered]@{name=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    })
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'tipos.json') -Encoding utf8
Write-Output 'PASS: C# Release y ABI SDK; sin instanciar contadores, adaptadores ni ETW.'

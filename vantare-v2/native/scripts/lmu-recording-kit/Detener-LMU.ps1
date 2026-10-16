$ErrorActionPreference='Stop'
$root=Join-Path $PSScriptRoot 'grabaciones'
if (Test-Path -LiteralPath $root) {
    Get-ChildItem -LiteralPath $root -Directory | ForEach-Object {
        [IO.File]::WriteAllText((Join-Path $_.FullName 'STOP'), '')
    }
}
Write-Host 'Parada solicitada. Espera FINALIZADO en la consola de grabacion.'

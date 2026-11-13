$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$core = & (Join-Path $PSScriptRoot 'ci-group-tests.ps1') -Group core -ListOnly
if ($LASTEXITCODE) { throw 'ListOnly core falló' }
if ($core -notmatch 'vantare-runtime' -or $core -match 'vantare-ui') { throw "Grupo core incorrecto: $core" }
$surface = & (Join-Path $PSScriptRoot 'ci-group-tests.ps1') -Group surface -ListOnly
if ($LASTEXITCODE) { throw 'ListOnly surface falló' }
if ($surface -notmatch 'vantare-ui' -or $surface -match 'vantare-runtime') { throw "Grupo surface incorrecto: $surface" }
Write-Host 'ci-groups ok'

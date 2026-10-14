#requires -Version 5.1
[CmdletBinding()]
param([string]$ArtifactsDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$count = 0
function Assert-Msix([bool]$Condition, [string]$Name) {
    if (-not $Condition) { throw "FAIL: $Name" }
    $script:count++
    Write-Output "PASS: $Name"
}
foreach ($script in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1') {
    $errors = $null; $tokens = $null
    [Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$errors) | Out-Null
    Assert-Msix ($errors.Count -eq 0) ("Parser 5.1: " + $script.Name)
}
$native = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$unused = Join-Path $native ('target/msix-negative-' + [Guid]::NewGuid().ToString('N'))
foreach ($bad in @('0.0.0.0', '1.2.3', '1.2.3.65536', '1.2.3.4.5', '1.0.0-local', '999999999999999999.0.0.0')) {
    $rejected = $false
    try { & (Join-Path $PSScriptRoot 'build.ps1') -OutputDirectory $unused -Version $bad | Out-Null } catch { $rejected = $true }
    Assert-Msix $rejected ("Rechaza versión: " + $bad)
}
Assert-Msix (-not (Test-Path -LiteralPath $unused)) 'Negativos no crean salida'
$rejected = $false
try { & (Join-Path $PSScriptRoot 'build.ps1') -OutputDirectory (Join-Path $native 'msix-no-permitido') | Out-Null } catch { $rejected = $true }
Assert-Msix $rejected 'Rechaza salida fuera de target'
$rejected = $false
try { & (Join-Path $PSScriptRoot 'build.ps1') -OutputDirectory $unused -TestSign -IdentityName 'Identidad.Store' | Out-Null } catch { $rejected = $true }
Assert-Msix $rejected 'Rechaza firma de prueba para Store'
if ($ArtifactsDirectory) {
    $root = (Resolve-Path -LiteralPath $ArtifactsDirectory).Path
    $evidence = Get-Content -LiteralPath (Join-Path $root 'build-evidence.json') -Raw | ConvertFrom-Json
    $package = Join-Path $root "vantare-native-$($evidence.version)-x64.msix"
    Assert-Msix ((Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant() -eq $evidence.package_sha256) 'SHA256 MSIX real'
    $unpacked = Join-Path $root ('unpacked-' + [Guid]::NewGuid().ToString('N'))
    & (Join-Path $evidence.sdk_directory 'makeappx.exe') unpack /p $package /d $unpacked
    Assert-Msix ($LASTEXITCODE -eq 0) 'SDK desempaqueta MSIX'
    foreach ($file in $evidence.files) {
        Assert-Msix ((Get-FileHash -LiteralPath (Join-Path $unpacked $file.path) -Algorithm SHA256).Hash.ToLowerInvariant() -eq $file.sha256) ("Payload íntegro: " + $file.path)
    }
    [xml]$manifest = Get-Content -LiteralPath (Join-Path $unpacked 'AppxManifest.xml') -Raw
    Assert-Msix ($manifest.Package.Identity.Name -eq $evidence.identity -and $manifest.Package.Identity.Publisher -eq $evidence.publisher -and $manifest.Package.Identity.Version -eq $evidence.version) 'Identidad empaquetada coincide'
    Assert-Msix (@($manifest.Package.Capabilities.ChildNodes).Count -eq 1 -and $manifest.Package.Capabilities.Capability.Name -eq 'runFullTrust') 'Solo runFullTrust'
    $metadata = & cargo metadata --offline --locked --no-deps --format-version 1 --manifest-path (Join-Path $native 'Cargo.toml') | ConvertFrom-Json
    Assert-Msix ($LASTEXITCODE -eq 0) 'Inventario Cargo consultado'
    $expected = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members } | ForEach-Object { $_.targets | Where-Object { 'bin' -cin $_.kind } | ForEach-Object { $_.name + '.exe' } })
    $actual = @(Get-ChildItem -LiteralPath (Join-Path $unpacked 'bin') -File | ForEach-Object { $_.Name })
    Assert-Msix (@(Compare-Object $expected $actual -CaseSensitive).Count -eq 0) 'Todos los binarios nativos, ninguno extra'
    $rejected = $false
    try { & (Join-Path $PSScriptRoot 'build.ps1') -OutputDirectory $root | Out-Null } catch { $rejected = $true }
    Assert-Msix $rejected 'No sobrescribe artefactos existentes'
} else { Write-Output 'SKIP: paquete real (indicar ArtifactsDirectory tras Build)' }
Write-Output "$count comprobaciones PASS"

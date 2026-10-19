#requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'candidate.ps1')
$passed = 0
function Assert-Inventory([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:passed++
    "PASS $Message"
}
# La lista pública contractual se mantiene, aunque el workspace gane herramientas QA.
$public = @('vantare','vantare-core','vantare-overlays','vantare-hub','vantare-engineer','vantare-services','vantare-storage','vantare-grabar-lmu','vantare-grabar-acc','vantare-import-profile')
$private = @('vantare-grabar-lmu-completo','vantare-verificar-lmu')
$build = @($public + 'vantare-workshop' + $private)
Assert-NativeBuildInventory $build
Assert-Inventory $true 'Build acepta producto, Workshop y las dos herramientas QA conocidas'
Assert-Inventory (@(Compare-Object $public @(Get-NativeBins 'beta') -CaseSensitive).Count -eq 0) 'Beta conserva exactamente los diez EXE publicos'
foreach ($channel in @('nightly','testers','master','beta')) {
    Assert-Inventory (@(Get-NativeBins $channel | Where-Object { $_ -cin $private }).Count -eq 0) "QA privada excluida de $channel"
}
foreach ($invalid in @(
    @{ bins = @($build + 'unapproved-tool'); name = 'Bin desconocido rechazado' },
    @{ bins = @($build + 'vantare-admin'); name = 'Admin no se admite como producto publico' },
    @{ bins = @($build | Where-Object { $_ -cne 'vantare-verificar-lmu' }); name = 'Herramienta QA ausente detectada' },
    @{ bins = @($build + 'vantare-verificar-lmu'); name = 'Bin duplicado rechazado' }
)) {
    $rejected = $false
    try { Assert-NativeBuildInventory $invalid.bins } catch { $rejected = $true }
    Assert-Inventory $rejected $invalid.name
}
# These are runtime requirements, independent of the packaging list. The Hub
# opens the Standings sequence on fresh startup and selects alerts by snapshot.
$members=@(Get-NativeMembers 'beta')
foreach($required in @('standings-design-system.sequence.json','session-alerts.snapshot.json')){
    Assert-Inventory (('bin/fixtures/'+$required) -cin $members) "Recurso runtime obligatorio incluido: $required"
}
Assert-Inventory (@($script:NativeFixtures|Sort-Object -Unique).Count -eq $script:NativeFixtures.Count -and -not @($script:NativeFixtures|Where-Object {$_ -match '[*?]'}).Count) 'Inventario de recursos cerrado, único y sin glob'
$fixtureRoot=Join-Path (Split-Path $PSScriptRoot) 'ui/fixtures'
foreach($member in $script:NativeFixtures){
    if(-not (Test-Path -LiteralPath (Join-Path $fixtureRoot $member.Substring('bin/fixtures/'.Length)) -PathType Leaf)){throw "Recurso enumerado ausente: $member"}
}
Assert-Inventory $true 'Todos los recursos enumerados existen en la fuente'
"$passed checks PASS"
& (Join-Path $PSScriptRoot 'historical-inventory-tests.ps1')

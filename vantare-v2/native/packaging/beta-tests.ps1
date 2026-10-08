#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$Version010Directory,
    [Parameter(Mandatory)][string]$Version011Directory,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [Parameter(Mandatory)][string]$TestVerifier,
    [Parameter(Mandatory)][string]$SigningKeyFile
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'config-tests.ps1') -EvidenceDirectory $EvidenceDirectory
. (Join-Path $PSScriptRoot 'beta.ps1')
$script:Passed = 0
function Assert-Beta([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERT: $Message" }
    $script:Passed++
    Write-Output "PASS $Message"
}
function Reject-Beta([scriptblock]$Action, [string]$Message) {
    $failed = $false
    try { $null = & $Action } catch { $failed = $true }
    Assert-Beta $failed $Message
}
$evidence = Assert-NativePath $EvidenceDirectory
[IO.Directory]::CreateDirectory($evidence) | Out-Null
$root = Join-Path $evidence ('roundtrip-' + [guid]::NewGuid().ToString('N'))
$first = Join-Path $Version010Directory 'vantare-native-amd64-package.zip'
$next = Join-Path $Version011Directory 'vantare-native-amd64-package.zip'
$firstHash = Get-NativeHash $first
$nextHash = Get-NativeHash $next
$candidate = Join-Path $PSScriptRoot 'candidate.ps1'
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
$probe = Join-Path $PSScriptRoot 'fixtures/hash-without-cmdlet.ps1'
$info.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$probe`" -Candidate `"$candidate`" -ProbePath `"$next`" -ProbeHash $nextHash"
$info.UseShellExecute = $false; $info.CreateNoWindow = $true
$info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
$process = [Diagnostics.Process]::Start($info)
try {
    if (-not $process.WaitForExit(30000)) { $process.Kill(); throw 'Timeout de prueba SHA-256 sin cmdlet.' }
    [IO.File]::WriteAllText((Join-Path $evidence 'hash-without-cmdlet.log'), $process.StandardOutput.ReadToEnd() + $process.StandardError.ReadToEnd())
    Assert-Beta ($process.ExitCode -eq 0) 'hash del host funciona sin Get-FileHash/autoload'
} finally { $process.Dispose() }
Install-Beta $root $first $firstHash
$initial = (Read-NativeState $root).active.generation
$installedBootstrap = Join-Path $root 'candidate.ps1'
Assert-Beta ((Get-NativeHash $installedBootstrap) -ceq (Get-NativeHash $candidate)) 'bootstrap instalado coincide con candidate.ps1 productivo'
$fromBootstrap = & $installedBootstrap -Operation Status -Root $root | ConvertFrom-Json
Assert-Beta ($fromBootstrap.active.generation -ceq $initial) 'CLI del bootstrap instalado lee la generación real'
$old = Join-Path $root "generations/$initial"
$oldVersion = (Read-NativeManifest $old 'beta').version
$data = Join-Path $old 'data/local-profile.json'
[IO.File]::WriteAllText($data, '{"profile":"local test","layout":[1,2],"account":"fake-test-account"}')
$dataHash = Get-NativeHash $data
Assert-Beta ((Read-BetaVersion '0.1.10') -gt (Read-BetaVersion '0.1.9')) 'comparación numérica'
foreach ($version in @('', '0.1', '01.1.0', '0.1.1-beta', '-1.2.3', '1.2.65536', '1.2.3.4')) {
    Reject-Beta { Read-BetaVersion $version } "versión inválida rechazada: $version"
}
# Sesión abierta y binarios abiertos conservan selección y datos, sin matar procesos.
$session = [IO.File]::Open((Join-Path $root 'beta-session.lock'), [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try { Reject-Beta { Install-Beta $root $next $nextHash } 'Setup exige cerrar la sesión' }
finally { $session.Dispose() }
$busy = [IO.File]::Open((Join-Path $old 'bin/vantare-hub.exe'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try { Reject-Beta { Install-Beta $root $next $nextHash } 'Setup exige cerrar binarios en uso' }
finally { $busy.Dispose() }
Assert-Beta ((Read-NativeState $root).active.generation -ceq $initial) 'rechazo conserva selección'
Assert-Beta (-not (Test-Path (Join-Path $root 'boot-pending.json'))) 'rechazo no deja arranque pendiente'
Reject-Beta { Install-Beta $root $next ('0' * 64) } 'Setup rechaza SHA incorrecto'
Install-Beta $root $next $nextHash
$updated = Read-NativeState $root
$active = Join-Path $root "generations/$($updated.active.generation)"
$newVersion = (Read-NativeManifest $active 'beta').version
Assert-Beta ((Read-BetaVersion $newVersion) -gt (Read-BetaVersion $oldVersion)) 'Setup actualiza a versión mayor'
Assert-Beta ($updated.previous.generation -ceq $initial) 'Setup usa Update y conserva generación anterior'
Assert-Beta ((Get-NativeHash (Join-Path $active 'data/local-profile.json')) -ceq $dataHash) 'Setup conserva perfil, layout y cuenta'
Assert-Beta (Test-Path (Join-Path $root 'boot-pending.json')) 'Setup exige confirmación de arranque'
Reject-Beta { Install-Beta $root $next $nextHash } 'Setup no sustituye una actualización sin confirmar'
# Proceso real, sin ventana ni marcador inventado: fallo antes del ready.
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = Join-Path $active 'bin/vantare-hub.exe'
$info.Arguments = '--invalid-beta-start'
$info.UseShellExecute = $false; $info.CreateNoWindow = $true
$info.RedirectStandardError = $true
$process = [Diagnostics.Process]::Start($info)
try {
    Assert-Beta (-not (Confirm-BetaBoot $root $process 15)) 'fallo real del Hub nuevo dispara rollback'
    Assert-Beta ($process.HasExited -and $process.ExitCode -ne 0) 'Hub nuevo termina con error real'
    [IO.File]::WriteAllText((Join-Path $evidence 'failed-start.stderr.log'), $process.StandardError.ReadToEnd())
} finally { $process.Dispose() }
Assert-Beta ((Read-NativeState $root).active.generation -ceq $initial) 'rollback recupera versión anterior'
Assert-Beta ((Get-NativeHash $data) -ceq $dataHash) 'rollback conserva datos anteriores'
# Misma versión también crea una generación íntegra y reversible.
Install-Beta $root $first $firstHash
$repaired = Read-NativeState $root
Assert-Beta ($repaired.active.generation -cne $initial) 'misma versión reinstala binarios'
Assert-Beta ((Get-NativeHash (Join-Path $root "generations/$($repaired.active.generation)/data/local-profile.json")) -ceq $dataHash) 'reinstalación conserva datos'
# Confirm-BetaBoot ya se verificó con proceso real; limpiar pendiente mediante rollback.
$null = Restore-NativeCandidate $root
Remove-Item -LiteralPath (Join-Path $root 'boot-pending.json')
# Una reparación también recupera un binario ausente, sin seleccionar datos viejos.
Remove-Item -LiteralPath (Join-Path $old 'bin/vantare-hub.exe')
Install-Beta $root $first $firstHash
$fixed = Read-NativeState $root
Assert-Beta (Test-Path (Join-Path $root "generations/$($fixed.active.generation)/bin/vantare-hub.exe")) 'reparar recupera binario ausente'
Assert-Beta ((Get-NativeHash (Join-Path $root "generations/$($fixed.active.generation)/data/local-profile.json")) -ceq $dataHash) 'reparar binario dañado conserva datos actuales'
Remove-Item -LiteralPath (Join-Path $root 'boot-pending.json')
Install-Beta $root $next $nextHash
$updated = Read-NativeState $root
Remove-Item -LiteralPath (Join-Path $root 'boot-pending.json')
Reject-Beta { Install-Beta $root $first $firstHash } 'versión inferior rechazada sin bajar en silencio'
Assert-Beta ((Read-NativeState $root).active.generation -ceq $updated.active.generation) 'downgrade conserva versión nueva'
foreach ($bin in (Get-NativeBins 'beta')) {
    $text = & (Join-Path $root "generations/$($updated.active.generation)/bin/$bin.exe") --version
    Assert-Beta ($LASTEXITCODE -eq 0 -and $text -ceq "Vantare Native $newVersion (beta)") "versión embebida: $bin"
}
# Datos de la generación activa distintos de anteriores: no elegir por fechas.
$latestData = Join-Path $root "generations/$($updated.active.generation)/data/local-profile.json"
[IO.File]::WriteAllText($latestData, '{"profile":"changed after update","account":"fake-test-account"}')
$latestHash = Get-NativeHash $latestData
Uninstall-Beta $root
Assert-Beta (-not (Test-Path (Join-Path $root 'state.json'))) 'desinstalar retira estado activo'
Assert-Beta ((Get-NativeHash $latestData) -ceq $latestHash) 'desinstalar conserva datos más recientes'
Reject-Beta { Install-Beta $root $first $firstHash } 'datos conservados no se adoptan con versión inferior'
Install-Beta $root $next $nextHash
$adopted = (Read-NativeState $root).active.generation
Assert-Beta ((Get-NativeHash (Join-Path $root "generations/$adopted/data/local-profile.json")) -ceq $latestHash) 'reinstalar adopta la copia activa exacta entre varias generaciones'
Assert-Beta (-not (Test-Path (Join-Path $root 'retained-data.json'))) 'referencia consumida tras reinstalar'
# Compatibilidad con desinstalador antiguo de una generación, sin referencia guardada.
$legacy = Join-Path $evidence ('legacy-' + [guid]::NewGuid().ToString('N'))
Install-Beta $legacy $first $firstHash
$legacyGeneration = (Read-NativeState $legacy).active.generation
$legacyData = Join-Path $legacy "generations/$legacyGeneration/data/profile.json"
[IO.File]::WriteAllText($legacyData, '{"legacy":"preserved"}')
Uninstall-Beta $legacy
Remove-Item -LiteralPath (Join-Path $legacy 'retained-data.json')
Install-Beta $legacy $next $nextHash
Assert-Beta ([IO.File]::ReadAllText((Join-Path $legacy "generations/$((Read-NativeState $legacy).active.generation)/data/profile.json")) -ceq '{"legacy":"preserved"}') 'desinstalación antigua adopta datos sin mover carpetas'
$legacyActiveData = Join-Path $legacy "generations/$((Read-NativeState $legacy).active.generation)/data/profile.json"
[IO.File]::WriteAllText($legacyActiveData, '{"legacy":"different active copy"}')
Uninstall-Beta $legacy
Remove-Item -LiteralPath (Join-Path $legacy 'retained-data.json')
Reject-Beta { Install-Beta $legacy $next $nextHash } 'desinstalación antigua con copias diferentes no elige datos arbitrariamente'
Assert-Beta ([IO.File]::ReadAllText($legacyActiveData) -ceq '{"legacy":"different active copy"}') 'rechazo de copias antiguas ambiguas conserva datos'
# El feed sigue exigiendo firmas: solo estos paquetes QA sustituyen services
# por un verificador aislado de TEST, sin alterar la clave del producto.
function New-SignedTestPackage([string]$Archive, [string]$Label) {
    $payload = Join-Path $evidence ($Label + '-' + [guid]::NewGuid().ToString('N'))
    $manifest = Expand-NativePackage $Archive (Get-NativeHash $Archive) $payload 'beta'
    Copy-Item -LiteralPath $TestVerifier -Destination (Join-Path $payload 'bin/vantare-services.exe') -Force
    $hash = Get-NativeHash (Join-Path $payload 'bin/vantare-services.exe')
    [IO.File]::WriteAllText((Join-Path $payload 'bin/vantare-services.exe.sha256'), "$hash  vantare-services.exe`n", [Text.UTF8Encoding]::new($false))
    foreach ($file in $manifest.files) {
        $item = Get-Item -LiteralPath (Join-Path $payload $file.path)
        $file.size = $item.Length; $file.sha256 = Get-NativeHash $item.FullName
    }
    Remove-Item -LiteralPath (Join-Path $payload 'manifest.json')
    Write-NativeJson (Join-Path $payload 'manifest.json') $manifest
    $zip = "$payload.zip"
    New-NativeZip $payload $zip
    $zip
}
$signedFirst = New-SignedTestPackage $first 'signed-first'
$signedNext = New-SignedTestPackage $next 'signed-next'
$feedRoot = Join-Path $evidence ('signed-install-' + [guid]::NewGuid().ToString('N'))
$null = Install-NativeCandidate $feedRoot $signedFirst (Get-NativeHash $signedFirst) 'beta'
$feedInitial = (Read-NativeState $feedRoot).active.generation
$manifest = @{schema=1;product='vantare-native';channel='beta';version=$newVersion;url=([uri]$signedNext).AbsoluteUri;sha256=(Get-NativeHash $signedNext);notes='Actualización de prueba con clave TEST'}
$feed = Join-Path $evidence 'signed-manifest.json'
$signed = Invoke-BetaManifestTool $TestVerifier ($manifest | ConvertTo-Json) $SigningKeyFile
[IO.File]::WriteAllText($feed, $signed, [Text.UTF8Encoding]::new($false))
Reject-Beta { Read-BetaManifest $signed $false $TestVerifier } 'file URI firmada rechazada fuera del modo local'
foreach ($field in @('schema', 'channel', 'version', 'sha256', 'product', 'url')) {
    $bad = $manifest.Clone(); $bad[$field] = 'invalid'
    Reject-Beta { Read-BetaManifest (Invoke-BetaManifestTool $TestVerifier ($bad | ConvertTo-Json) $SigningKeyFile) $true $TestVerifier } "contrato inválido rechazado: $field"
}
$bad = $manifest.Clone(); $bad.schema = $true
Reject-Beta { Read-BetaManifest (Invoke-BetaManifestTool $TestVerifier ($bad | ConvertTo-Json) $SigningKeyFile) $true $TestVerifier } 'schema booleano rechazado'
$bad = $manifest.Clone(); $bad.notes = 'a' * 8193
Reject-Beta { Read-BetaManifest (Invoke-BetaManifestTool $TestVerifier ($bad | ConvertTo-Json) $SigningKeyFile) $true $TestVerifier } 'notas excesivas rechazadas'
$bad = $manifest.Clone(); $bad.execute = 'forbidden'
Reject-Beta { Read-BetaManifest (Invoke-BetaManifestTool $TestVerifier ($bad | ConvertTo-Json) $SigningKeyFile) $true $TestVerifier } 'campo desconocido rechazado'
$bad = $manifest.Clone(); $bad.sha256 = '0' * 64
$badSigned = Invoke-BetaManifestTool $TestVerifier ($bad | ConvertTo-Json) $SigningKeyFile
$badFeed = Join-Path $evidence 'bad-sha.json'
[IO.File]::WriteAllText($badFeed, $badSigned, [Text.UTF8Encoding]::new($false))
Reject-Beta { Stage-BetaUpdate $feedRoot $badFeed } 'feed firmado rechaza SHA incorrecto antes de activar'
Assert-Beta ((Read-NativeState $feedRoot).active.generation -ceq $feedInitial) 'SHA incorrecto conserva generación activa'
Assert-Beta (Stage-BetaUpdate $feedRoot $feed) 'feed firmado prepara actualización'
Assert-Beta (Stage-BetaUpdate $feedRoot $feed) 'feed reutiliza staging íntegro'
Assert-Beta ((Read-NativeState $feedRoot).active.generation -ceq $feedInitial) 'staging no activa generación'
$status = [IO.File]::ReadAllText((Join-Path $feedRoot 'update-status.json')) | ConvertFrom-Json
Assert-Beta ($status.state -ceq 'ready' -and $status.version -ceq $newVersion) 'aviso durable de actualización lista'
$pending = Join-Path $feedRoot 'staging/pending.json'
$tampered = $signed | ConvertFrom-Json
$bytes = [Convert]::FromBase64String($tampered.payload); $bytes[10] = $bytes[10] -bxor 1
$tampered.payload = [Convert]::ToBase64String($bytes)
Write-BetaJson $pending $tampered
Reject-Beta { Apply-BetaUpdate $feedRoot } 'firma alterada rechazada al aplicar'
[IO.File]::WriteAllText($pending, $signed, [Text.UTF8Encoding]::new($false))
$bad = $manifest.Clone(); $parsedVersion = Read-BetaVersion $newVersion
$bad.version = "$($parsedVersion.Major).$($parsedVersion.Minor).$($parsedVersion.Build + 1)"
[IO.File]::WriteAllText($pending, (Invoke-BetaManifestTool $TestVerifier ($bad | ConvertTo-Json) $SigningKeyFile), [Text.UTF8Encoding]::new($false))
Reject-Beta { Apply-BetaUpdate $feedRoot } 'versión pendiente firmada distinta del ZIP rechazada'
Assert-Beta ((Read-NativeState $feedRoot).active.generation -ceq $feedInitial) 'pendiente alterado no activa generación'
[IO.File]::WriteAllText($pending, $signed, [Text.UTF8Encoding]::new($false))
$busy = [IO.File]::Open((Join-Path $feedRoot "generations/$feedInitial/bin/vantare-hub.exe"), 'Open', 'Read', 'Read')
try {
    Reject-Beta { Apply-BetaUpdate $feedRoot } 'feed rechaza binario en uso'
    Assert-Beta ((Read-NativeState $feedRoot).active.generation -ceq $feedInitial) 'feed ocupado conserva selección'
    Assert-Beta (-not (Test-Path (Join-Path $feedRoot 'boot-pending.json'))) 'feed ocupado no deja arranque pendiente'
    Assert-Beta (Test-Path $pending) 'feed ocupado conserva actualización pendiente'
} finally { $busy.Dispose() }
Assert-Beta (Apply-BetaUpdate $feedRoot) 'feed y Setup comparten activación'
Assert-Beta (Test-Path (Join-Path $feedRoot 'boot-pending.json')) 'feed exige confirmación durable'
Assert-Beta (-not (Apply-BetaUpdate $feedRoot)) 'Apply repetido no crea generación'
Assert-Beta (-not (Stage-BetaUpdate $feedRoot $feed)) 'misma versión no se ofrece de nuevo'
Write-Output "$script:Passed comprobaciones PASS. Evidencia: $root"

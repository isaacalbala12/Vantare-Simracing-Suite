#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$Version010Directory,
    [Parameter(Mandatory)][string]$Version011Directory,
    [Parameter(Mandatory)][string]$EvidenceDirectory
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
$published = [IO.File]::ReadAllText((Join-Path $Version011Directory 'vantare-native-beta.json')) | ConvertFrom-Json
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = Join-Path $PSHOME 'powershell.exe'
$probe = Join-Path $PSScriptRoot 'fixtures/hash-without-cmdlet.ps1'
$candidate = Join-Path $PSScriptRoot 'candidate.ps1'
$info.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$probe`" -Candidate `"$candidate`" -ProbePath `"$next`" -ProbeHash $($published.sha256)"
$info.UseShellExecute = $false; $info.CreateNoWindow = $true
$info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
$process = [Diagnostics.Process]::Start($info)
try {
    if (-not $process.WaitForExit(30000)) { $process.Kill(); throw 'Timeout de prueba SHA-256 sin cmdlet.' }
    [IO.File]::WriteAllText((Join-Path $evidence 'hash-without-cmdlet.log'), $process.StandardOutput.ReadToEnd() + $process.StandardError.ReadToEnd())
    Assert-Beta ($process.ExitCode -eq 0) 'hash del host funciona sin Get-FileHash/autoload'
} finally { $process.Dispose() }
$null = Install-NativeCandidate $root $first (Get-NativeHash $first) 'beta'
$installedBootstrap = Join-Path $root 'candidate.ps1'
Assert-Beta ((Get-NativeHash $installedBootstrap) -ceq (Get-NativeHash $candidate)) 'bootstrap instalado coincide con candidate.ps1 productivo'
$state = Read-NativeState $root
$fromBootstrap = & $installedBootstrap -Operation Status -Root $root | ConvertFrom-Json
Assert-Beta ($fromBootstrap.active.generation -ceq $state.active.generation) 'CLI del bootstrap instalado lee la generación real'
$initial = $state.active.generation
$data = Join-Path $root "generations/$initial/data/local-profile.json"
[IO.File]::WriteAllText($data, '{"preserve":"local beta test"}')
$dataHash = Get-NativeHash $data
Assert-Beta ((Read-BetaVersion '0.1.10') -gt (Read-BetaVersion '0.1.9')) 'comparación numérica, no lexicográfica'
Assert-Beta ((Read-BetaVersion '1.0.0') -gt (Read-BetaVersion '0.99.99')) 'major prevalece sobre minor y patch'
foreach ($version in @('', '0.1', '01.1.0', '0.1.1-beta', '-1.2.3', '1.2.65536', '1.2.3.4')) {
    Reject-Beta { Read-BetaVersion $version } "versión inválida rechazada: $version"
}
$manifest = [ordered]@{ schema = 1; product = 'vantare-native'; channel = 'beta'; version = '0.1.1'; url = ([uri][IO.Path]::GetFullPath($next)).AbsoluteUri; sha256 = (Get-NativeHash $next); notes = 'Actualización de prueba local 0.1.0 a 0.1.1' }
$feed = Join-Path $evidence 'local-manifest.json'
Write-NativeJson $feed $manifest
Reject-Beta { Read-BetaManifest ([IO.File]::ReadAllText($feed)) } 'file URI rechazada fuera del modo local explícito'
foreach ($field in @('schema', 'channel', 'version', 'sha256', 'product', 'url')) {
    $bad = [IO.File]::ReadAllText($feed) | ConvertFrom-Json
    $bad.$field = 'invalid'
    Reject-Beta { Read-BetaManifest (ConvertTo-Json $bad) $true } "manifiesto inválido rechazado: $field"
}
$bad = [IO.File]::ReadAllText($feed) | ConvertFrom-Json
$bad.schema = $true
Reject-Beta { Read-BetaManifest (ConvertTo-Json $bad) $true } 'schema booleano no equivale a versión 1'
$bad = [IO.File]::ReadAllText($feed) | ConvertFrom-Json
$bad.notes = 'a' * 8193
Reject-Beta { Read-BetaManifest (ConvertTo-Json $bad) $true } 'notas excesivas rechazadas antes del staging'
$bad = [IO.File]::ReadAllText($feed) | ConvertFrom-Json
$bad | Add-Member NoteProperty execute 'forbidden'
Reject-Beta { Read-BetaManifest (ConvertTo-Json $bad) $true } 'campo desconocido rechazado'
$bad.sha256 = '0' * 64
$bad.PSObject.Properties.Remove('execute')
$badFeed = Join-Path $evidence 'bad-sha.json'
Write-NativeJson $badFeed $bad
Reject-Beta { Stage-BetaUpdate $root $badFeed } 'SHA erróneo rechazado antes de activar'
Assert-Beta ((Read-NativeState $root).active.generation -ceq $initial) 'SHA erróneo conserva generación activa'
Assert-Beta (Stage-BetaUpdate $root $feed) 'manifiesto local descarga y prepara actualización'
Assert-Beta (Stage-BetaUpdate $root $feed) 'segunda comprobación reutiliza staging íntegro'
Assert-Beta ((Read-NativeState $root).active.generation -ceq $initial) 'staging no cambia la selección activa'
$status = [IO.File]::ReadAllText((Join-Path $root 'update-status.json')) | ConvertFrom-Json
Assert-Beta ($status.state -ceq 'ready' -and $status.version -ceq '0.1.1') 'aviso durable de actualización lista'
$pendingFile = Join-Path $root 'staging/pending.json'
$tampered = [IO.File]::ReadAllText($pendingFile) | ConvertFrom-Json
$tampered.version = '0.1.2'
Write-BetaJson $pendingFile $tampered
Reject-Beta { Apply-BetaUpdate $root } 'versión pendiente distinta del ZIP rechazada al aplicar'
Assert-Beta ((Read-NativeState $root).active.generation -ceq $initial) 'pendiente alterado no activa una generación'
Write-BetaJson $pendingFile $manifest
$busyExe = Join-Path $root "generations/$initial/bin/vantare-hub.exe"
$busy = [IO.File]::Open($busyExe, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
    Reject-Beta { Apply-BetaUpdate $root } 'binario en uso rechaza Update'
    Assert-Beta ((Read-NativeState $root).active.generation -ceq $initial) 'rechazo conserva la versión instalada'
    Assert-Beta (-not (Test-Path -LiteralPath (Join-Path $root 'boot-pending.json'))) 'rechazo no deja un arranque nuevo por confirmar'
    Assert-Beta (Test-Path -LiteralPath (Join-Path $root 'staging/pending.json')) 'rechazo conserva la actualización pendiente'
} finally { $busy.Dispose() }
Assert-Beta (Apply-BetaUpdate $root) 'aplicación utiliza Update de candidate.ps1'
$updated = Read-NativeState $root
$active = Join-Path $root "generations/$($updated.active.generation)"
Assert-Beta ((Read-NativeManifest $active 'beta').version -ceq '0.1.1') 'versión instalada avanza de 0.1.0 a 0.1.1'
Assert-Beta ($updated.previous.generation -ceq $initial) 'anterior disponible para rollback'
Assert-Beta ((Get-NativeHash (Join-Path $active 'data/local-profile.json')) -ceq $dataHash) 'datos copiados sin alteración'
Assert-Beta (-not (Apply-BetaUpdate $root)) 'aplicación repetida no crea otra generación'
Assert-Beta (-not (Stage-BetaUpdate $root $feed)) 'misma versión no se ofrece de nuevo'
foreach ($bin in $script:NativeBins) {
    $exe = Join-Path $active "bin/$bin.exe"
    $versionText = & $exe --version
    Assert-Beta ($LASTEXITCODE -eq 0 -and $versionText -ceq 'Vantare Native 0.1.1 (beta)') "versión y canal embebidos: $bin"
}
# Proceso real que rechaza un arranque, sin abrir ventana ni falsificar el marcador.
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = Join-Path $active 'bin/vantare-hub.exe'
$info.Arguments = '--invalid-beta-start'
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardError = $true
$process = [Diagnostics.Process]::Start($info)
try {
    Assert-Beta (-not (Confirm-BetaBoot $root $process 15)) 'fallo real del proceso antes del ready dispara rollback'
    $process.StandardError.ReadToEnd() | Set-Content (Join-Path $evidence 'failed-start.stderr.log')
} finally { $process.Dispose() }
$restored = Read-NativeState $root
Assert-Beta ($restored.active.generation -ceq $initial) 'rollback recupera la generación 0.1.0'
Assert-Beta ((Get-NativeHash $data) -ceq $dataHash) 'rollback conserva los datos anteriores'
$null = Restore-NativeCandidate $root
Assert-Beta ((Read-NativeState $root).active.generation -ceq $updated.active.generation) 'rollback reversible, conserva también versión retirada'
Uninstall-Beta $root
Assert-Beta ((Get-NativeHash $data) -ceq $dataHash) 'desinstalar conserva datos de las generaciones'
Assert-Beta (-not (Test-Path -LiteralPath (Join-Path $active 'bin/vantare-hub.exe'))) 'desinstalar retira los binarios'
Write-Output "$script:Passed comprobaciones PASS. Evidencia: $root"

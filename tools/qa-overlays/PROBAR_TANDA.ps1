# Ensayo del controlador con transporte, procesos y GPU falsos. Ningún PC remoto.
$ErrorActionPreference='Stop'
. "$PSScriptRoot/TANDA.ps1" -SoloFunciones
$env:VANTARE_SIN_GRAFICOS='1'
$source=Get-Content "$PSScriptRoot/TANDA.ps1" -Raw
$embedded=[regex]::Match($source,"(?s)Add-Type @'\r?\n(.*?)\r?\n'@")
if(-not $embedded.Success){throw 'Falta clase de sesión/inactividad'}
# Solo compila las declaraciones Win32: jamás llama a User32/WTS en el ensayo.
if(-not ('TandaIdle' -as [type])){Add-Type -TypeDefinition $embedded.Groups[1].Value}
$sandbox=Join-Path ([IO.Path]::GetTempPath()) ('vantare-tanda-test-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $sandbox
$root=Join-Path $sandbox 'kit'
$pythonCandidates=@(Get-Command python.exe -CommandType Application -All|ForEach-Object Source|Where-Object {$_ -notlike '*\WindowsApps\*'})
$script:PythonExe=$pythonCandidates|Where-Object {(Get-TandaPythonVersion $_) -ge [version]'3.11'}|Select-Object -First 1
if(-not $script:PythonExe){throw 'No Python 3.11+ interpreter for the fake run'}
foreach($dir in @('bin','inputs/case')){$null=New-Item -ItemType Directory -Path (Join-Path $root $dir) -Force}
foreach($name in @('vantare-overlays-rune.exe','vantare-overlays.exe','vantare-core.exe','vantare-services.exe','vantare.exe','lifecycle-harness.exe','lifecycle-rune-tests.exe','PresentMon-2.6.0-x64.exe')){
 Set-Content (Join-Path $root "bin/$name") 'FAKE NEVER EXECUTE' -Encoding utf8
}
Write-TandaJson @{version=11;state=@{}} (Join-Path $root 'inputs/case/photo.json')
Write-TandaJson @{kind='relative';designSystem='vantare'} (Join-Path $root 'inputs/case/settings.json')
Write-TandaJson @(@{version=11;state=@{}}) (Join-Path $root 'inputs/case/scene.json')
Set-Content (Join-Path $root 'inputs/case/photos.tsv') "0`tphoto.json" -Encoding utf8
Write-TandaJson @{version=1;instances=@(@{id='qa';x=0;y=0;settings=@{kind='relative';designSystem='vantare'}})} (Join-Path $root 'inputs/case/layout.json')
$files=@(Get-ChildItem $root -File -Recurse|ForEach-Object {@{path=[IO.Path]::GetRelativePath($root,$_.FullName);sha256=(Get-FileHash $_.FullName).Hash}})
$case=@{id='relative-vantare';kind='relative';layout='inputs/case/layout.json';settings='inputs/case/settings.json';scene='inputs/case/scene.json';sequence='inputs/case/photos.tsv';at_ms=0;scale=1;motion=$false;wall_ms=1767225600000}
$manifest=@{schema=1;source_sha=('a'*40);production_rights_configured=$true;presentmon=@{version='2.6.0';repository='GameTechDev/PresentMon'};captures=@($case);measurements=@(@{id='relative-replay-gpui';motor='gpui';state='replay';layout='inputs/case/settings.json'}) ;files=$files}
Write-TandaJson $manifest (Join-Path $root 'manifiesto.json')
$null=Assert-TandaInputs $root

$sealed=Join-Path $root 'recibo-falso'
$stage=Join-Path $sealed 'kit'
$null=New-Item -ItemType Directory $stage
$fakeManifest=Join-Path $stage 'manifiesto.json'
$fakeCi=Join-Path $stage 'ci-binarios.json'
$fakeCorpus=Join-Path $sealed 'corpus.tar.gz'
Set-Content -LiteralPath $fakeManifest 'manifest fixture'
$null=New-Item -ItemType Directory (Join-Path $stage 'bin')
$binaryNames=@('vantare-core.exe','vantare-qa-license.exe')
$ciRows=@(foreach($name in $binaryNames){
 $path=Join-Path $stage "bin/$name"
 Set-Content -LiteralPath $path $name
 @{file=$name;sha256=(Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant()}
})
Set-Content -LiteralPath $fakeCorpus 'corpus fixture'
$fakeZip=Join-Path $sealed 'kit.zip'
$fakeReceipt=Join-Path $sealed 'kit.receipt.json'
$binding=@{key_id='qa-01234567';registry_sha256='b'*64;core_sha256=$ciRows[0].sha256;cli_sha256=$ciRows[1].sha256}
Write-TandaJson @{source_sha='a'*40;run_id='123';license_key_id=$binding.key_id;license_registry_sha256=$binding.registry_sha256;
 license_public_keys_configured=$true;core_features=@('paint-stats','qa-license');qa_license_cli_sha256=$binding.cli_sha256;files=$ciRows} $fakeCi
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$fakeZip)
$corpus=@{name='corpus.tar.gz';sha256=(Get-FileHash -LiteralPath $fakeCorpus).Hash.ToLowerInvariant()}
$sealedManifest=@{source_sha='a'*40;scope='measurement-qa';external_corpus=$corpus;qa_license=$binding;ci_artifact=@{
 run_id='123';receipt_sha256=(Get-FileHash -LiteralPath $fakeCi).Hash.ToLowerInvariant()
}}
$record=@{schema=1;source_sha=$sealedManifest.source_sha;run_id='123';zip='kit.zip';qa_license=$binding;external_corpus=$corpus
 zip_sha256=(Get-FileHash -LiteralPath $fakeZip).Hash.ToLowerInvariant()
 manifest_sha256=(Get-FileHash -LiteralPath $fakeManifest).Hash.ToLowerInvariant();ci_receipt_sha256=$sealedManifest.ci_artifact.receipt_sha256
}
Write-TandaJson $record $fakeReceipt
$valid=Assert-TandaPackageReceipt $stage $sealedManifest $fakeZip $fakeReceipt $fakeCorpus
if($valid.zip_sha256 -cne $record.zip_sha256){throw 'Recibo válido no conservó el hash esperado'}
foreach($changed in @($fakeCorpus,$fakeZip,$fakeManifest,(Join-Path $stage 'bin/vantare-core.exe'),(Join-Path $stage 'bin/vantare-qa-license.exe'))){
 $original=[IO.File]::ReadAllBytes($changed)
 Add-Content -LiteralPath $changed 'mutated'
 $reject=$false
 try{$null=Assert-TandaPackageReceipt $stage $sealedManifest $fakeZip $fakeReceipt $fakeCorpus}catch{$reject=$_.Exception.Message -like 'QA_PACKAGE_RECEIPT*'}
 [IO.File]::WriteAllBytes($changed,$original)
 if(-not $reject){throw 'Input cambiado aceptado por el recibo QA'}
}
foreach($extraName in 'qa-license.key','bin/extra.exe'){
 $extra=Join-Path $stage $extraName
 Set-Content -LiteralPath $extra 'FAKE'
 $reject=$false
 try{$null=Assert-TandaPackageReceipt $stage $sealedManifest $fakeZip $fakeReceipt $fakeCorpus}catch{$reject=$_.Exception.Message -like 'QA_PACKAGE_RECEIPT*'}
 Remove-Item -LiteralPath $extra
 if(-not $reject){throw "Fichero extra aceptado: $extraName"}
}
foreach($field in 'run_id','key_id','core_sha256','cli_sha256'){
 $modified=Read-TandaJson $fakeReceipt
 if($field -eq 'run_id'){$modified.run_id='999'}else{
  $modified.qa_license[$field]='e'*64
  $sealedManifest.qa_license=$modified.qa_license
 }
 $wrong=Join-Path $sealed 'incorrecto.json'
 Write-TandaJson $modified $wrong
 $reject=$false
 try{$null=Assert-TandaPackageReceipt $stage $sealedManifest $fakeZip $wrong $fakeCorpus}catch{$reject=$_.Exception.Message -like 'QA_PACKAGE_RECEIPT*'}
 $sealedManifest.qa_license=$binding
 if(-not $reject){throw "Procedencia modificada aceptada: $field"}
}
$inside=Join-Path $stage 'receipt.json'
Copy-Item -LiteralPath $fakeReceipt -Destination $inside
$reject=$false
try{$null=Assert-TandaPackageReceipt $stage $sealedManifest $fakeZip $inside $fakeCorpus}catch{$reject=$_.Exception.Message -like 'QA_PACKAGE_RECEIPT*'}
if(-not $reject){throw 'Recibo interior aceptado'}
$png=Join-Path $sandbox 'header.png'
[byte[]]$header=@(137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,2,248,0,0,0,192)
[IO.File]::WriteAllBytes($png,$header)
$dimensions=@(Read-TandaPngSize $png)
if($dimensions[0] -ne 760 -or $dimensions[1] -ne 192){throw 'IHDR se interpretó con endian/tamaño incorrecto'}
$header[0]=0;[IO.File]::WriteAllBytes($png,$header)
$rejected=$false
try {$null=Read-TandaPngSize $png} catch {$rejected=$true}
if(-not $rejected){throw 'Salida no PNG aceptada'}
$stream=[IO.MemoryStream]::new()
Write-TandaFrame $stream @{version=20;sequence=1;command=@{command='LicenseStatus'}}
$stream.Position=0
$frame=Read-TandaFrame $stream
if($frame.command.command -ne 'LicenseStatus' -or $frame.version -ne 20){throw 'Frame Services no preserva el contrato existente'}
$stream.Dispose()
$policy=@{version=7;revision=1;state=@{kind='active'};catalog='pro';checked_at_ms=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();signed_until_ms=$null;grace_until_ms=$null}
Assert-TandaPolicy $policy
foreach($kind in @('unconfigured','no_credential','expired','unavailable','revoked')){
 $policy.state.kind=$kind;$rejected=$false
 try {Assert-TandaPolicy $policy} catch {$rejected=$true}
 if(-not $rejected){throw 'Política denegada produjo una ronda aparentemente válida'}
}
$trace=Join-Path $sandbox 'core.trace'
$frequency=[Diagnostics.Stopwatch]::Frequency
$validTrace="trace frequency=$frequency overflow=0`ntrace`tspan`tobserve`t115`t120`t0`t0`t0`ntrace`tspan`tobserve`t130`t140`t0`t0`t0`ntrace_end events=2`n"
Set-Content $trace $validTrace
if((Get-TandaReplayOrigin $trace) -ne 115){throw 'Origen no es primer Core::observe'}
foreach($bad in @($validTrace.Replace('overflow=0','overflow=1'),$validTrace.Replace('events=2','events=3'),$validTrace.Replace('span'+"`t"+'observe','span'+"`t"+'poll'),$validTrace.Replace('115','0'))){
 Set-Content $trace $bad
 $rejected=$false
 try {$null=Get-TandaReplayOrigin $trace} catch {$rejected=$true}
 if(-not $rejected){throw 'Traza inválida produjo origen inventado'}
}
$rejected=$false
try {Resolve-TandaPath $root '../escape'} catch {$rejected=$true}
if(-not $rejected){throw 'Aceptó traversal'}
$rejected=$false
try {Assert-TandaSession 1 isaac} catch {$rejected=$_.Exception.Message -like 'GRAPHICS_DISABLED*'}
if(-not $rejected){throw 'Guard no rechazó antes de CIM/User32/GPU'}
Add-Content (Join-Path $root 'inputs/case/photo.json') 'tampered'
$rejected=$false
try {$null=Assert-TandaInputs $root} catch {$rejected=$_.Exception.Message -like 'Hash incorrecto*'}
if(-not $rejected){throw 'Hash alterado aceptado'}
Write-TandaJson @{version=11;state=@{}} (Join-Path $root 'inputs/case/photo.json')
$script:NoAntesUtc=[DateTime]::UtcNow.AddMinutes(-1).ToString('o')
$script:LimiteUtc=[DateTime]::UtcNow.AddHours(1).ToString('o')
$script:Sesion=1;$script:Usuario='isaac'
$script:events=[Collections.Generic.List[string]]::new()
function Assert-TandaSession {param($Expected,$ExpectedUser) $script:events.Add('session-check')}
function Assert-TandaUnattended {$script:events.Add('unattended-check')}
function Read-TandaPngSize {param($Path) @(10,10)}
function Invoke-TandaProcess {param($Image,$Arguments,$Log,$Timeout=120,[switch]$WatchSession,$Environment=@{})
 if($Image -like '*vantare-overlays*.exe'){
  foreach($key in @('VANTARE_NATIVE_DATA_ROOT','LOCALAPPDATA','APPDATA')){if(-not $Environment[$key] -or $Environment[$key] -notlike '*capture-data*'){throw 'Captura fuera de QA aislado'}}
 }
 $script:events.Add('process:'+([IO.Path]::GetFileName($Image)))
 if($Arguments[0] -eq '--capture-batch'){
  if(-not (Get-Content -LiteralPath $Arguments[1] -Raw).TrimStart().StartsWith('[')){throw 'GPUI recibió objeto en vez de array de Request'}
 }
 $token=if($Image -like '*rune.exe'){'OK'}else{''}
 @{code=0;stderr=$token;stdout='4 passed; 0 failed'}
}
function Invoke-TandaMeasurement {param($Root,$Output,$Case)
 $script:events.Add('measurement:'+$Case.id)
}
$output=Join-Path $sandbox 'worker'
Invoke-TandaWorker $root $output
$state=Read-TandaJson (Join-Path $output 'estado.json')
if($state.status -ne 'complete' -or -not $state.completed_without_error -or $state.captures.Count -ne 3 -or $state.measurements.Count -ne 1){throw 'Recorrido falso incompleto'}
if(-not(Test-Path (Join-Path $output 'evidence-hashes.json'))){throw 'No cerró hashes de evidencia'}
$single=Read-TandaJson (Join-Path $root 'inputs/case/scene.json')
if($single -isnot [array] -or $single.Count -ne 1){throw 'JSON de una foto perdió el array'}
# Fallo de lifecycle: conservar evidencia, restaurar entorno y no medir después.
$script:fakeProcess=${function:Invoke-TandaProcess}
$beforeTemp=$env:TEMP;$beforePath=$env:PATH;$beforeNative=$env:VANTARE_NATIVE_DATA_ROOT
function Invoke-TandaProcess {param($Image,$Arguments,$Log,$Timeout=120,[switch]$WatchSession,$Environment=@{})
 if($Image -like '*lifecycle-rune-tests.exe'){return @{code=1;stderr='scenario failed';stdout='3 passed; 1 failed'}}
 & $script:fakeProcess @PSBoundParameters
}
$outputLifecycle=Join-Path $sandbox 'lifecycle-failed'
Invoke-TandaWorker $root $outputLifecycle
$state=Read-TandaJson (Join-Path $outputLifecycle 'estado.json')
if($state.status -ne 'aborted' -or $state.measurements.Count -ne 0 -or $env:TEMP -cne $beforeTemp -or $env:PATH -cne $beforePath -or $env:VANTARE_NATIVE_DATA_ROOT -cne $beforeNative){throw 'Lifecycle fallido no abortó/restauró entorno'}
if(-not(Test-Path (Join-Path $outputLifecycle 'lifecycle/resultado.json'))){throw 'Falta evidencia de lifecycle fallido'}
# La GPU ausente debe abortar sin pasar a GPUI/mediciones.
function Invoke-TandaProcess {param($Image,$Arguments,$Log,$Timeout=120,[switch]$WatchSession,$Environment=@{}) if($Image -like '*rune.exe'){@{code=4;stderr='GPU_UNAVAILABLE detalle';stdout=''}}else{@{code=0;stderr='';stdout=''}}}
$outputNoGpu=Join-Path $sandbox 'sin-gpu'
Invoke-TandaWorker $root $outputNoGpu
$state=Read-TandaJson (Join-Path $outputNoGpu 'estado.json')
if($state.status -ne 'aborted' -or $state.captures.Count -ne 1 -or $state.measurements.Count -ne 0){throw 'GPU ausente no abortó'}
# ACK validation remains real; no shutdown command is reachable on the server.
$rejected=$false
try {Assert-TandaShutdownEvidence $output} catch {$rejected=$true}
if(-not $rejected){throw 'ACK ausente aceptado'}
$hash=(Get-FileHash (Join-Path $output 'evidence-hashes.json')).Hash
Write-TandaJson @{verified=$true;hash_manifest=$hash;destination='fake-server'} (Join-Path $output 'copia-servidor.json')
Assert-TandaShutdownEvidence $output
# Input/countdown and the unconditional server guard are tested in PROBAR_SEGURIDAD.
# Simulación completa del lado servidor: solo tar/copia LOCALES, nunca SSH real.
function Assert-TandaSession {param($Expected,$ExpectedUser)}
function Invoke-TandaProcess {param($Image,$Arguments,$Log,$Timeout=120,[switch]$WatchSession,$Environment=@{}) @{code=0;stderr='OK';stdout='4 passed; 0 failed'}}
$sourceEvidence=Join-Path $sandbox 'server-source'
Invoke-TandaWorker $root $sourceEvidence
$script:fakeArchive=Join-Path $sandbox 'fake.tar'
& tar -cf $script:fakeArchive -C $sourceEvidence .
if($LASTEXITCODE){throw 'Tar local falso falló'}
$script:fakeHash=(Get-FileHash $script:fakeArchive).Hash
$script:transfer=[Collections.Generic.List[string]]::new()
$script:fakeUser='PC\isaac';$script:tamper=$false
function Assert-TandaMachineRegistry {}
function Start-Sleep {param($Seconds,$Milliseconds)}
function scp {
 if($args -contains '-r'){$script:transfer.Add('upload')}
 else {
  $script:transfer.Add('download')
  Copy-Item -LiteralPath $script:fakeArchive -Destination $args[-1]
  if($script:tamper){Add-Content -LiteralPath $args[-1] 'invalid'}
 }
 $global:LASTEXITCODE=0
}
function Invoke-TandaSsh {param($Target,$Code)
 if($Code -like '*Win32_ComputerSystem*') {return (@{user=$script:fakeUser;sessions=@(1)}|ConvertTo-Json -Compress)}
 if($Code -like '*evidence-hashes.json*' -and $Code.StartsWith('Test-Path')){return 'True'}
 if($Code -like '*tar -cf*'){return $script:fakeHash}
 if($Code -like '*Set-Content*copia-servidor.json*'){$script:transfer.Add('verified-ack');return ''}
 if($Code -like '*Set-ScheduledTask*'){
  if(-not $script:transfer.Contains('verified-ack')){throw 'Apagar antes de ACK'}
  $script:transfer.Add('interactive-finish');return ''
 }
 if($Code -like '*apagado.json*'){return '{"accepted":true}'}
 if($Code -like '*Unregister-ScheduledTask*'){$script:transfer.Add('unregister');return ''}
 if($Code -like '*Register-ScheduledTask*'){
  if($Code -like '*SAMPLER_TANDA.ps1*'){if($Code -notlike '*RunLevel Highest*'){throw 'Sampler no elevado'};$script:transfer.Add('register-sampler')}
  else {if($Code -notlike '*RunLevel Limited*'){throw 'Capturas/lifecycle elevados'};$script:transfer.Add('register-worker')}
  return ''
 }
 return ''
}
$script:DestinoServidor=Join-Path $sandbox 'server-copy'
$null=New-Item -ItemType Directory -Path $script:DestinoServidor
Invoke-TandaServer $root
if(($script:transfer -join ',') -ne 'upload,register-sampler,register-worker,download,verified-ack,interactive-finish,unregister,unregister'){throw ('Orden de transferencia/apagado incorrecto: '+($script:transfer -join ','))}
# Sesión ausente: nada de copiar, registrar tareas o apagar.
$script:transfer.Clear();$script:fakeUser=$null
$rejected=$false
try {Invoke-TandaServer $root} catch {$rejected=$true}
if(-not $rejected -or $script:transfer.Count){throw 'Sesión ausente tocó PC'}
# Copia alterada: no mandar ACK ni programar la fase de apagado.
$script:fakeUser='PC\isaac';$script:tamper=$true
$script:DestinoServidor=Join-Path $sandbox 'server-copy-tampered'
$null=New-Item -ItemType Directory -Path $script:DestinoServidor
$rejected=$false
try {Invoke-TandaServer $root} catch {$rejected=$true}
if(-not $rejected -or $script:transfer.Contains('verified-ack') -or $script:transfer.Contains('interactive-finish')){throw 'Copia alterada permitió apagado'}
# La tanda parcial pasa sin Machine y solo registra el trabajador limitado.
$script:SoloVisual=$true
$manifest.scope='visual-lifecycle'
$manifest.production_rights_configured=$false
$manifest.ci_artifact=@{run_id=123;name=('qa-kit-'+$manifest.source_sha)}
foreach($path in @('bin/lifecycle.exe','binarios.json','ci-binarios.json')){
 $file=Join-Path $root $path
 Set-Content -LiteralPath $file 'FAKE'
 $manifest.files+=@{path=$path;sha256=(Get-FileHash -LiteralPath $file).Hash}
}
Write-TandaJson $manifest (Join-Path $root 'manifiesto.json')
$rejected=$false
try {$null=Assert-TandaInputs $root} catch {$rejected=$_.Exception.Message -like '*no admite rondas*'}
if(-not $rejected){throw 'Modo visual admite medición en el manifiesto'}
$manifest.measurements=@()
Write-TandaJson $manifest (Join-Path $root 'manifiesto.json')
function Assert-TandaMachineRegistry {throw 'BLOCKED_LICENSE_CONFIG'}
$script:events.Clear()
$script:lifecycleCalls=[Collections.Generic.List[string]]::new()
function Invoke-TandaProcess {param($Image,$Arguments,$Log,$Timeout=120,[switch]$WatchSession,$Environment=@{})
 if($Image -like '*lifecycle.exe'){
  if($Arguments[0] -cne 'rune-lifecycle' -or -not $WatchSession){throw 'Escenario lifecycle fuera del controlador'}
  $script:lifecycleCalls.Add($Arguments[1])
 }
 @{code=0;stderr='OK';stdout=''}
}
Invoke-TandaWorker $root (Join-Path $sandbox 'visual-worker')
$visualState=Read-TandaJson (Join-Path $sandbox 'visual-worker/estado.json')
if($visualState.status -ne 'complete' -or $visualState.captures.Count -ne 3 -or $visualState.measurements.Count -ne 0 -or $visualState.lifecycle -ne '4 passed; 0 failed'){throw 'El trabajador visual no completó exclusivamente captura/lifecycle'}
if(($script:lifecycleCalls -join ',') -cne 'eof,restart,exit-zero,single'){throw 'No se despacharon los cuatro escenarios propios del arnés'}
$script:fakeArchive=Join-Path $sandbox 'visual.tar'
& tar -cf $script:fakeArchive -C (Join-Path $sandbox 'visual-worker') .
if($LASTEXITCODE){throw 'Tar local visual falso falló'}
$script:fakeHash=(Get-FileHash $script:fakeArchive).Hash
$script:transfer.Clear()
$script:tamper=$false
$script:DestinoServidor=Join-Path $sandbox 'visual-copy'
$null=New-Item -ItemType Directory -Path $script:DestinoServidor
Invoke-TandaServer $root
if(($script:transfer -join ',') -ne 'upload,register-worker,download,verified-ack,interactive-finish,unregister'){throw 'La tanda visual registró un sampler o no conservó el protocolo de apagado'}
$script:SoloVisual=$false
$script:transfer.Clear()
$rejected=$false
try {Invoke-TandaServer $root} catch {$rejected=$_.Exception.Message -eq 'BLOCKED_LICENSE_CONFIG'}
if(-not $rejected -or $script:transfer.Count){throw 'La tanda completa perdió el bloqueo Machine'}
"PASS: hashes/traversal, guard temprano, capturas y medidas falsas, ausencia GPU, ACK antes de apagado y actividad; sandbox=$sandbox"

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
foreach($dir in @('bin','inputs/case')){$null=New-Item -ItemType Directory -Path (Join-Path $root $dir) -Force}
foreach($name in @('vantare-overlays-rune.exe','vantare-overlays.exe','vantare-core.exe','vantare-services.exe','vantare.exe','lifecycle-harness.exe','lifecycle-rune-tests.exe','PresentMon-2.6.0-x64.exe')){
 Set-Content (Join-Path $root "bin/$name") 'FAKE NEVER EXECUTE' -Encoding utf8
}
Write-TandaJson @{version=11;state=@{}} (Join-Path $root 'inputs/case/photo.json')
Write-TandaJson @{kind='relative';designSystem='vantare'} (Join-Path $root 'inputs/case/settings.json')
Write-TandaJson @(@{version=11;state=@{}}) (Join-Path $root 'inputs/case/scene.json')
Set-Content (Join-Path $root 'inputs/case/photos.tsv') "0`tphoto.json" -Encoding utf8
$files=@(Get-ChildItem $root -File -Recurse|ForEach-Object {@{path=[IO.Path]::GetRelativePath($root,$_.FullName);sha256=(Get-FileHash $_.FullName).Hash}})
$case=@{id='relative-vantare';kind='relative';settings='inputs/case/settings.json';scene='inputs/case/scene.json';sequence='inputs/case/photos.tsv';at_ms=0;scale=1;motion=$false;wall_ms=1767225600000}
$manifest=@{schema=1;source_sha=('a'*40);production_rights_configured=$true;presentmon=@{version='2.6.0';repository='GameTechDev/PresentMon'};captures=@($case);measurements=@(@{id='relative-replay-gpui';motor='gpui';state='replay';layout='inputs/case/settings.json'}) ;files=$files}
Write-TandaJson $manifest (Join-Path $root 'manifiesto.json')
$null=Assert-TandaInputs $root
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
function Invoke-TandaProcess {param($Image,$Arguments,$Log,$Timeout=120,[switch]$WatchSession)
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
if($state.status -ne 'complete' -or -not $state.cleaned -or $state.captures.Count -ne 3 -or $state.measurements.Count -ne 1){throw 'Recorrido falso incompleto'}
if(-not(Test-Path (Join-Path $output 'evidence-hashes.json'))){throw 'No cerró hashes de evidencia'}
$single=Read-TandaJson (Join-Path $root 'inputs/case/scene.json')
if($single -isnot [array] -or $single.Count -ne 1){throw 'JSON de una foto perdió el array'}
# Fallo de lifecycle: conservar evidencia, restaurar entorno y no medir después.
$script:fakeProcess=${function:Invoke-TandaProcess}
$beforeTemp=$env:TEMP
function Invoke-TandaProcess {param($Image,$Arguments,$Log,$Timeout=120,[switch]$WatchSession)
 if($Image -like '*lifecycle-rune-tests.exe'){return @{code=1;stderr='scenario failed';stdout='3 passed; 1 failed'}}
 & $script:fakeProcess @PSBoundParameters
}
$outputLifecycle=Join-Path $sandbox 'lifecycle-failed'
Invoke-TandaWorker $root $outputLifecycle
$state=Read-TandaJson (Join-Path $outputLifecycle 'estado.json')
if($state.status -ne 'aborted' -or $state.measurements.Count -ne 0 -or $env:TEMP -cne $beforeTemp){throw 'Lifecycle fallido no abortó/restauró entorno'}
if(-not(Test-Path (Join-Path $outputLifecycle 'lifecycle/resultado.json'))){throw 'Falta evidencia de lifecycle fallido'}
# La GPU ausente debe abortar sin pasar a GPUI/mediciones.
function Invoke-TandaProcess {param($Image,$Arguments,$Log,$Timeout=120,[switch]$WatchSession) @{code=4;stderr='GPU_UNAVAILABLE detalle';stdout=''}}
$outputNoGpu=Join-Path $sandbox 'sin-gpu'
Invoke-TandaWorker $root $outputNoGpu
$state=Read-TandaJson (Join-Path $outputNoGpu 'estado.json')
if($state.status -ne 'aborted' -or $state.captures.Count -ne 1 -or $state.measurements.Count -ne 0){throw 'GPU ausente no abortó'}
# Apagar requiere ACK de una copia verificada: sin él no se llama al comando.
$script:shutdownCalls=0
function shutdown {$script:shutdownCalls++;$global:LASTEXITCODE=0}
Invoke-TandaShutdown $root $output
$ack=Read-TandaJson (Join-Path $output 'apagado.json')
if($ack.accepted -or $script:shutdownCalls){throw 'Apagó sin copia verificada'}
$hash=(Get-FileHash (Join-Path $output 'evidence-hashes.json')).Hash
Write-TandaJson @{verified=$true;hash_manifest=$hash;destination='fake-server'} (Join-Path $output 'copia-servidor.json')
Invoke-TandaShutdown $root $output
$ack=Read-TandaJson (Join-Path $output 'apagado.json')
if(-not $ack.accepted -or $script:shutdownCalls -ne 1){throw 'No respetó ACK de copia antes de apagado falso'}
# Actividad inesperada al finalizar cancela el apagado incluso con ACK.
function Assert-TandaSession {param($Expected,$ExpectedUser) throw 'Actividad inesperada'}
Invoke-TandaShutdown $root $output
$ack=Read-TandaJson (Join-Path $output 'apagado.json')
if($ack.accepted -or $script:shutdownCalls -ne 1){throw 'Apagó con actividad inesperada'}
# Simulación completa del lado servidor: solo tar/copia LOCALES, nunca SSH real.
function Assert-TandaSession {param($Expected,$ExpectedUser)}
function Invoke-TandaProcess {param($Image,$Arguments,$Log,$Timeout=120,[switch]$WatchSession) @{code=0;stderr='OK';stdout='4 passed; 0 failed'}}
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
 if($Code -like '*Register-ScheduledTask*'){$script:transfer.Add('register');return ''}
 return ''
}
$script:DestinoServidor=Join-Path $sandbox 'server-copy'
$null=New-Item -ItemType Directory -Path $script:DestinoServidor
Invoke-TandaServer $root
if(($script:transfer -join ',') -ne 'upload,register,download,verified-ack,interactive-finish,unregister'){throw ('Orden de transferencia/apagado incorrecto: '+($script:transfer -join ','))}
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
"PASS: hashes/traversal, guard temprano, capturas y medidas falsas, ausencia GPU, ACK antes de apagado y actividad; sandbox=$sandbox"

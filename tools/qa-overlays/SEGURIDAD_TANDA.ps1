# Helpers without graphics. Shutdown actions are injected; none is a default.
if(-not(Get-Variable TandaGameProcesses -Scope Script -ErrorAction SilentlyContinue)){
 Set-Variable -Scope Script -Option ReadOnly -Name TandaGameProcesses -Value @(
  'Le Mans Ultimate','LeMansUltimate','LMU','rFactor2','rF2','iRacingSim64DX11','iRacingSim64',
  'AC2-Win64-Shipping','AssettoCorsaEVO','AssettoCorsaEVO-Win64-Shipping','ACE-Win64-Shipping','ACEVO','AC EVO',
  'Automobilista2','Automobilista2AVX','AMS2','acs','acs_x86','SimHub','SimHubWPF',
  'RRRE','RaceRoomRacingExperience','Rennsport','Rennsport-Win64-Shipping',
  'F1_23','F1_24','F1_25','ForzaHorizon5','ForzaMotorsport','steam-big-picture')
}
function Find-TandaGameActivity($Processes){
 foreach($process in $Processes){
  if($process.Name -in $script:TandaGameProcesses -or
   ($process.Name -in @('steam','steamwebhelper') -and $process.CommandLine -match '(?i)(?:^|\s)-(?:gamepadui|bigpicture|tenfoot)(?:\s|$)')){$process.Name}
 }
}
function Assert-TandaNoGames {
 $processes=@(Get-Process|ForEach-Object {@{Name=$_.ProcessName;CommandLine=''}})
 if(@($processes|Where-Object Name -in @('steam','steamwebhelper')).Count){
  $processes+=@(Get-CimInstance Win32_Process -Filter "Name='steam.exe' OR Name='steamwebhelper.exe'"|ForEach-Object {@{Name=[IO.Path]::GetFileNameWithoutExtension($_.Name);CommandLine=$_.CommandLine}})
 }
 if(@(Find-TandaGameActivity $processes).Count){throw 'Juego/SimHub/Steam Big Picture en uso; no cerrar procesos de Isaac'}
}
function Get-TandaProfileRoots {
 $native=if($env:VANTARE_NATIVE_DATA_ROOT){$env:VANTARE_NATIVE_DATA_ROOT}else{$env:LOCALAPPDATA}
 @($native,$env:LOCALAPPDATA,$env:APPDATA)|Where-Object {$_}|ForEach-Object {
  Join-Path $_ 'Vantare';Join-Path $_ 'VantareNative'
 }|Sort-Object -Unique
}
function Get-TandaProfileSnapshot([string[]]$Roots){
 foreach($root in ($Roots|Sort-Object -Unique)){
  $root=[IO.Path]::GetFullPath($root)
  $exists=Test-Path -LiteralPath $root
  @{root=$root;path='';exists=[bool]$exists;sha256=$null}
  if(-not $exists){continue}
  if((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Perfil con enlace: no seguirlo'}
  foreach($file in Get-ChildItem -LiteralPath $root -Force -Recurse){
   $relative=[IO.Path]::GetRelativePath($root,$file.FullName)
   if(($relative -split '[/\\]') -icontains 'logs'){continue}
   if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Perfil con enlace: no seguirlo'}
   if(-not $file.PSIsContainer){@{root=$root;path=$relative;exists=$true;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}}
  }
 }
}
function Assert-TandaProfileUnchanged($Before,$After){
 $a=ConvertTo-Json -InputObject @($Before|Sort-Object root,path) -Depth 8 -Compress
 $b=ConvertTo-Json -InputObject @($After|Sort-Object root,path) -Depth 8 -Compress
 if($a -cne $b){throw 'PROFILE_CHANGED: perfil real cambió fuera de logs; abortar sin apagar'}
}
function Convert-TandaPolicyEvidence($Policy){
 @{state=@{kind=[string]$Policy.state.kind};catalog=[string]$Policy.catalog}
}
function Write-TandaEvidenceHashes([string]$Output){
 $final=Join-Path $Output 'evidence-hashes.json';$temp=$final+'.tmp'
 if((Test-Path -LiteralPath $final) -or (Test-Path -LiteralPath $temp)){throw 'Manifiesto de evidencia ya existe'}
 $files=@(Get-ChildItem -LiteralPath $Output -File -Recurse|ForEach-Object {
  if($_.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Enlace en evidencia'}
  @{path=[IO.Path]::GetRelativePath($Output,$_.FullName);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
 })
 Write-TandaJson $files $temp
 [IO.File]::Move($temp,$final)
}
function Assert-TandaPython([string]$Path,[switch]$SyntaxOnly){
 if(-not [IO.Path]::IsPathFullyQualified($Path) -or $Path -notmatch '^[A-Za-z]:[/\\][A-Za-z0-9_ .\\/()-]+\.exe$'){throw 'PythonExe debe ser ruta absoluta a python.exe, sin código de shell'}
 if(-not $SyntaxOnly){
  if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){throw 'Falta PythonExe absoluto; no instalar en el PC'}
  if((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PythonExe no puede ser enlace'}
 }
}
function Invoke-TandaPython([string[]]$Arguments,[string]$Log,[int]$Timeout=120){
 Assert-TandaPython $PythonExe
 Invoke-TandaProcess $PythonExe (@('-I')+$Arguments) $Log $Timeout
}
function Invoke-TandaShutdownCountdown([scriptblock]$Request,[scriptblock]$Cancel,[scriptblock]$Check,[scriptblock]$Sleep,[scriptblock]$Clock){
 $state=@{accepted=$false;cancelled=$false;delay_s=60};$scheduled=$false
 try {
  & $Check
  & $Request @('/s','/t','60','/c','Tanda QA de Vantare: apagado automático')
  $scheduled=$true;$start=& $Clock
  while((& $Clock)-$start -lt 60){& $Check;& $Sleep 100}
  & $Check
  $state.accepted=$true
 } catch {
  $state.error=$_.Exception.Message
  if($scheduled){try {& $Cancel;$state.cancelled=$true} catch {$state.cancel_error=$_.Exception.Message}}
 }
 $state
}
function Assert-TandaShutdownEvidence([string]$Output){
 $ack=Read-TandaJson (Join-Path $Output 'copia-servidor.json')
 $state=Read-TandaJson (Join-Path $Output 'estado.json')
 $hash=(Get-FileHash -LiteralPath (Join-Path $Output 'evidence-hashes.json') -Algorithm SHA256).Hash
 if(-not $ack.verified -or $ack.hash_manifest -ine $hash -or $state.status -ne 'complete' -or -not $state.completed_without_error){throw 'Falta copia verificada/fin correcto; no apagar'}
}
function New-TandaQaEnvironment([string]$Directory){
 $environment=@{}
 foreach($name in @('VANTARE_NATIVE_DATA_ROOT','LOCALAPPDATA','APPDATA')){
  $path=Join-Path $Directory $name
  $null=New-Item -ItemType Directory -Path $path -Force
  $environment[$name]=$path
 }
 $environment
}
function Get-TandaSamplerDefinitions([string]$Root,[string]$Output,[string]$Prefix,$Cases){
 if($Prefix -notmatch '^Vantare-tanda-\d{8}T\d{6}Z$'){throw 'Prefijo de tareas no autorizado'}
 foreach($case in $Cases){
  $round=Join-Path $Output ('perf/'+$case.id)
  $seconds=if($case.state -eq 'replay'){65}else{60}
  @{name=($Prefix+'-sampler-'+$case.id);run_level='Highest';
    arguments="-NoProfile -WindowStyle Hidden -File $Root/tools/qa-overlays/SAMPLER_TANDA.ps1 -Kit $Root -Round $round -Seconds $seconds"}
 }
}
function Start-TandaSampler([string]$Root,[string]$Round,$Case){
 if($env:VANTARE_SIN_GRAFICOS -eq '1' -or $env:COMPUTERNAME -ieq 'SAPPHIREOS'){throw 'GRAPHICS_DISABLED: no iniciar sampler real en servidor'}
 $definition=@(Get-TandaSamplerDefinitions $Root (Split-Path (Split-Path $Round)) $SamplerTaskPrefix @($Case))[0]
 $task=Get-ScheduledTask -TaskName $definition.name -ErrorAction Stop
 if([string]$task.Principal.RunLevel -ne 'Highest' -or @($task.Actions).Count -ne 1 -or $task.Actions[0].Arguments -cne $definition.arguments -or $task.Actions[0].Execute -ine (Get-Process -Id $PID).Path){throw 'Sampler elevado no corresponde a la acción preautorizada'}
 Start-ScheduledTask -TaskName $definition.name
 @{task_name=$definition.name;round=$Round;closed=$false}
}
function Test-TandaSamplerFinished($Handle){
 Test-Path -LiteralPath (Join-Path $Handle.round 'sampler-result.json')
}
function Get-TandaSamplerExitCode($Handle){
 [int](Read-TandaJson (Join-Path $Handle.round 'sampler-result.json')).code
}
function Close-TandaSampler($Handle){
 if(-not $Handle -or $Handle.closed){return}
 $deadline=[DateTime]::UtcNow.AddSeconds(120)
 while(-not(Test-TandaSamplerFinished $Handle)){
  if([DateTime]::UtcNow -ge $deadline){throw 'SAMPLER_NOT_FINISHED: no afirmar cierre ni apagar'}
  Start-Sleep -Milliseconds 250
 }
 $Handle.closed=$true
 if((Get-TandaSamplerExitCode $Handle) -ne 0){throw 'SAMPLER_FAILED: consultar sampler-result.json; no apagar'}
}
function Expand-TandaEvidence([string]$Archive,[string]$Destination){
 if(Test-Path -LiteralPath $Destination){throw 'Destino de extracción ya existe'}
 $names=@{}
 # First pass validates EVERY header before creating any output directory.
 $stream=[IO.File]::OpenRead($Archive);$reader=[System.Formats.Tar.TarReader]::new($stream)
 try {
  while($entry=$reader.GetNextEntry()){
   if($entry.EntryType -notin @([System.Formats.Tar.TarEntryType]::RegularFile,[System.Formats.Tar.TarEntryType]::V7RegularFile,[System.Formats.Tar.TarEntryType]::Directory)){throw 'Enlace o tipo tar no admitido'}
   if($entry.Name -in @('.','./')){continue}
   if($entry.Name -match ':'){throw 'Ruta tar insegura'}
   $path=Resolve-TandaPath $Destination $entry.Name
   if($names.ContainsKey($path)){throw 'Ruta tar duplicada'};$names[$path]=$true
  }
 } finally {$reader.Dispose();$stream.Dispose()}
 $null=New-Item -ItemType Directory -Path $Destination
 $stream=[IO.File]::OpenRead($Archive);$reader=[System.Formats.Tar.TarReader]::new($stream)
 try {
  while($entry=$reader.GetNextEntry()){
   if($entry.Name -in @('.','./')){continue}
   $path=Resolve-TandaPath $Destination $entry.Name
   if($entry.EntryType -eq [System.Formats.Tar.TarEntryType]::Directory){$null=New-Item -ItemType Directory -Path $path -Force;continue}
   $null=New-Item -ItemType Directory -Path (Split-Path $path) -Force
   $file=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
   try {if($entry.DataStream){$entry.DataStream.CopyTo($file)}} finally {$file.Dispose()}
  }
 } finally {$reader.Dispose();$stream.Dispose()}
}

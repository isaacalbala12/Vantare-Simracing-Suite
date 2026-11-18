#requires -Version 7
# Entrada única del operador. Importar funciones es inerte; nunca crea dispositivos.
[CmdletBinding()]
param(
 [ValidateSet('Validar','Ensayo','VerificarCustodiaQA','FirmarCredencialQA','Servidor','Trabajador','Apagar')][string]$Modo='Validar',
 [string]$Kit=$PSScriptRoot,
 [string]$PythonExe='',
 [string]$SamplerTaskPrefix='',
 [string]$Pc='isaac@100.83.142.118',
 [string]$Usuario='isaac',
 [int]$Sesion=-1,
 [string]$NoAntesUtc='',
 [string]$LimiteUtc='',
 [string]$Salida='',
 [string]$DestinoServidor='D:/VantareServer/evidence/overlays-rune',
 [string]$ZipQA='',
 [string]$ZipSha256QA='',
 [string]$KeyIdQA='',
 [string]$FingerprintQA='',
 [string]$CliSha256QA='',
 [string[]]$LogsQA=@(),
 [switch]$SoloVisual,
 [switch]$SoloFunciones
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'SEGURIDAD_TANDA.ps1')
. (Join-Path $PSScriptRoot 'LICENCIA_TANDA.ps1')

function Read-TandaJson([string]$Path){ Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -AsHashtable -NoEnumerate }
function Write-TandaJson($Value,[string]$Path){ConvertTo-Json -InputObject $Value -Depth 30|Set-Content -LiteralPath $Path -Encoding utf8}
function Assert-TandaMachineRegistry {
 # Solo el servidor coordinador necesita el entorno de compilación. El PC
 # verifica la política real del núcleo, que lleva el registro ya compilado.
 if(-not [Environment]::GetEnvironmentVariable('VANTARE_LICENSE_PUBLIC_KEYS','Machine')){
  throw 'BLOCKED_LICENSE_CONFIG: falta VANTARE_LICENSE_PUBLIC_KEYS en Machine; no se lanza ni apaga el PC'
 }
}
function Resolve-TandaPath([string]$Root,[string]$Relative){
 if([IO.Path]::IsPathRooted($Relative)){throw "Ruta absoluta en manifiesto: $Relative"}
 $base=[IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
 $path=[IO.Path]::GetFullPath((Join-Path $Root $Relative))
 if(-not $path.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw "Ruta fuera del kit: $Relative"}
 $path
}
function Assert-TandaInputs([string]$Root,[switch]$DryValidation){
 $manifest=Read-TandaJson (Join-Path $Root 'manifiesto.json')
 if($manifest.schema -ne 1 -or $manifest.source_sha -notmatch '^[0-9a-f]{40}$'){throw 'Manifiesto sin schema/SHA válido'}
 $visualManifest=$manifest.ContainsKey('scope') -and $manifest.scope -ceq 'visual-lifecycle'
 if([bool]$SoloVisual -ne $visualManifest){throw 'Modo y alcance del manifiesto no coinciden'}
 if($SoloVisual -and $manifest.measurements.Count -ne 0){throw 'El modo visual no admite rondas de medición'}
 if(-not $SoloVisual -and -not $manifest.production_rights_configured -and -not ($DryValidation -and $env:VANTARE_SIN_GRAFICOS -eq '1')){throw 'BLOCKED_LICENSE_CONFIG: núcleo compilado sin registro público de licencia; no medir overlays ocultos'}
 $seen=@{}
 foreach($file in $manifest.files){
  $path=Resolve-TandaPath $Root $file.path
  if($seen.ContainsKey($path)){throw "Ruta repetida: $path"};$seen[$path]=$true
  if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw "Falta input: $($file.path)"}
  if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $file.sha256){throw "Hash incorrecto: $($file.path)"}
 }
 $requiredFiles=@('bin/vantare-overlays-rune.exe','bin/vantare-overlays.exe','bin/vantare.exe')
 if($SoloVisual){
  $requiredFiles+=@('bin/lifecycle.exe','ci-binarios.json','binarios.json')
  if([string]$manifest.ci_artifact.run_id -notmatch '\A[1-9][0-9]*\z' -or $manifest.ci_artifact.name -cne ('qa-kit-'+$manifest.source_sha)){throw 'Procedencia CI visual inválida'}
 }else{$requiredFiles+=@('bin/lifecycle-harness.exe','bin/lifecycle-rune-tests.exe','bin/vantare-core.exe','bin/vantare-services.exe','bin/PresentMon-2.6.0-x64.exe')}
 foreach($required in $requiredFiles){
  $path=Resolve-TandaPath $Root $required
  if(-not $seen.ContainsKey($path)){throw "Binario sin hash: $required"}
 }
 if(-not $SoloVisual -and ($manifest.presentmon.version -ne '2.6.0' -or $manifest.presentmon.repository -ne 'GameTechDev/PresentMon')){throw 'PresentMon sin procedencia oficial fijada'}
 foreach($case in $manifest.measurements){
  if($case.id -notmatch '^[a-z0-9][a-z0-9-]+$' -or $case.motor -notin @('gpui','rune') -or $case.state -notin @('waiting','replay')){throw 'Caso de medición inválido'}
  $layout=Resolve-TandaPath $Root $case.layout
  if(-not $seen.ContainsKey($layout)){throw 'Layout de medición sin hash'}
 }
 if($manifest.captures.Count -eq 0 -or (-not $SoloVisual -and $manifest.measurements.Count -eq 0)){throw 'Tanda sin casos'}
 $outputs=@{}
 foreach($case in $manifest.captures){
  if($case.id -notmatch '^[a-z0-9][a-z0-9-]+$' -or $outputs.ContainsKey($case.id)){throw 'ID de captura inválido/repetido'}
  $outputs[$case.id]=$true
  foreach($relative in @($case.settings,$case.layout,$case.scene,$case.sequence)){
   $path=Resolve-TandaPath $Root $relative
   if(-not $seen.ContainsKey($path)){throw "Input sin hash: $relative"}
  }
  if($case.scale -notin @(1,1.25,1.5) -or $case.at_ms -lt 0 -or $case.at_ms -gt 60000){throw 'Escala/tiempo fuera del contrato'}
  $last=-1;$count=0;$photoBytes=0
  foreach($line in Get-Content -LiteralPath (Resolve-TandaPath $Root $case.sequence)){
   $parts=$line.Split("`t")
   if($parts.Count -ne 2 -or $parts[0] -notmatch '^\d+$' -or [int]$parts[0] -lt $last){throw 'TSV inválido'}
   $last=[int]$parts[0];$count++
   $photo=Resolve-TandaPath (Split-Path (Resolve-TandaPath $Root $case.sequence)) $parts[1]
   if(-not $seen.ContainsKey($photo)){throw 'Foto TSV sin hash'}
   if((Get-Item -LiteralPath $photo).Length -gt 8MB){throw 'Foto excede 8 MiB'}
   $photoBytes+=(Get-Item -LiteralPath $photo).Length
   $null=Read-TandaJson $photo
  }
  if($count -eq 0 -or $count -gt 256 -or $case.at_ms -lt $last -or $photoBytes -gt 64MB){throw 'Prefijo/at-ms/cota de fotos inválido'}
 }
 $manifest
}
function Invoke-TandaProcess([string]$Image,[string[]]$Arguments,[string]$Log,[int]$Timeout=120,[switch]$WatchSession,[hashtable]$Environment=@{}){
 # ArgumentList conserva rutas con espacios sin construir código de shell.
 $info=[Diagnostics.ProcessStartInfo]::new($Image)
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardError=$true;$info.RedirectStandardOutput=$true
 foreach($argument in $Arguments){$info.ArgumentList.Add($argument)}
 foreach($key in $Environment.Keys){$info.Environment[$key]=[string]$Environment[$key]}
 $p=[Diagnostics.Process]::new();$p.StartInfo=$info
 $started=$false
 try {
  if($WatchSession){Assert-TandaUnattended}
  if(-not $p.Start()){throw 'No arrancó el proceso'}
  $started=$true
  $stderr=$p.StandardError.ReadToEndAsync();$stdout=$p.StandardOutput.ReadToEndAsync()
  $deadline=[DateTime]::UtcNow.AddSeconds($Timeout)
  while(-not $p.WaitForExit(250)){
   if($WatchSession){Assert-TandaUnattended}
   if([DateTime]::UtcNow -ge $deadline){throw "Timeout: $Image"}
  }
  $err=$stderr.GetAwaiter().GetResult();$out=$stdout.GetAwaiter().GetResult()
  [IO.File]::WriteAllText($Log+'.stderr.txt',$err)
  [IO.File]::WriteAllText($Log+'.stdout.txt',$out)
  @{code=$p.ExitCode;stderr=$err;stdout=$out}
 } finally {if($started -and -not $p.HasExited){$p.Kill($true);$p.WaitForExit()};$p.Dispose()}
}
function Read-TandaPngSize([string]$Path){
 $stream=[IO.File]::OpenRead($Path)
 try {$bytes=Read-TandaExact $stream 24} finally {$stream.Dispose()}
 if([BitConverter]::ToString($bytes,0,8) -ne '89-50-4E-47-0D-0A-1A-0A' -or [BitConverter]::ToString($bytes,12,4) -ne '49-48-44-52'){throw 'Salida no es PNG con IHDR'}
 $width=[Net.IPAddress]::NetworkToHostOrder([BitConverter]::ToInt32($bytes,16))
 $height=[Net.IPAddress]::NetworkToHostOrder([BitConverter]::ToInt32($bytes,20))
 if($width -lt 1 -or $height -lt 1 -or $width -gt 4096 -or $height -gt 4096){throw 'Dimensiones PNG fuera de contrato'}
 @($width,$height)
}
function Assert-TandaWindow([string]$Start,[string]$End){
 $pattern='^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?Z$'
 if($Start -notmatch $pattern -or $End -notmatch $pattern){throw 'INVALID_WINDOW: usar UTC ISO estricta terminada en Z'}
 if([DateTimeOffset]::Parse($End) -le [DateTimeOffset]::Parse($Start)){throw 'INVALID_WINDOW: fin anterior al inicio'}
 $now=[DateTimeOffset]::UtcNow
 if($now -lt [DateTimeOffset]::Parse($Start) -or $now -ge [DateTimeOffset]::Parse($End)){throw 'Fuera de la ventana autorizada'}
}
function Assert-TandaSession([int]$Expected,[string]$ExpectedUser){
 if($env:VANTARE_SIN_GRAFICOS -eq '1' -or $env:COMPUTERNAME -ieq 'SAPPHIREOS' -or (Test-Path 'C:/VantareServer/orquestador/noche/cabecera-mac.md')){throw 'GRAPHICS_DISABLED: no se permite Trabajador en servidor'}
 $current=[Diagnostics.Process]::GetCurrentProcess().SessionId
 if($Expected -le 0 -or $current -ne $Expected){throw 'Sin sesión interactiva esperada'}
 $computer=Get-CimInstance Win32_ComputerSystem
 if(-not $computer.UserName -or ($computer.UserName -split '\\')[-1] -ine $ExpectedUser){throw 'Usuario inesperado o sesión cerrada'}
 $explorers=@(Get-Process explorer -ErrorAction SilentlyContinue)
 if($explorers.Count -eq 0 -or @($explorers|Where-Object SessionId -ne $Expected).Count){throw 'Sesión adicional o escritorio ausente'}
 Assert-TandaNoGames
 if(@(Get-Process -Name 'vantare','vantare-core','vantare-overlays','vantare-overlays-rune','vantare-hub' -ErrorAction SilentlyContinue).Count){throw 'Vantare de Isaac está abierto; no cerrar ni compartir su núcleo/datos con la tanda'}
 $gpus=@(Get-CimInstance Win32_VideoController|Where-Object {$_.Name -notmatch 'Basic|Virtual|Remote|Meta'})
 if(-not $gpus.Count){throw 'GPU_UNAVAILABLE: sin controlador físico visible'}
 if(-not ('TandaIdle' -as [type])){
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TandaIdle {
 [StructLayout(LayoutKind.Sequential)] struct Info {public uint size;public uint time;}
 [StructLayout(LayoutKind.Sequential)] struct Session {public int id;public IntPtr station;public int state;}
 [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref Info data);
 [DllImport("wtsapi32.dll",EntryPoint="WTSEnumerateSessionsW",SetLastError=true)] static extern bool Enumerate(IntPtr server,int reserved,int version,out IntPtr data,out int count);
 [DllImport("wtsapi32.dll",EntryPoint="WTSQuerySessionInformationW",SetLastError=true)] static extern bool Query(IntPtr server,int session,int field,out IntPtr data,out int count);
 [DllImport("wtsapi32.dll")] static extern void WTSFreeMemory(IntPtr memory);
 public static uint Milliseconds(){var v=new Info{size=(uint)Marshal.SizeOf<Info>()};if(!GetLastInputInfo(ref v))throw new InvalidOperationException("GetLastInputInfo");return unchecked((uint)Environment.TickCount-v.time);}
 public static bool OnlyExpectedSession(int expected,string user){
  IntPtr data;int count;if(!Enumerate(IntPtr.Zero,0,1,out data,out count))throw new InvalidOperationException("WTSEnumerateSessions");
  bool found=false;try{for(int i=0;i<count;i++){
   var s=Marshal.PtrToStructure<Session>(IntPtr.Add(data,i*Marshal.SizeOf<Session>()));if(s.id<=0||s.state>=6)continue;
   IntPtr name;int bytes;if(!Query(IntPtr.Zero,s.id,5,out name,out bytes))throw new InvalidOperationException("WTSQuerySessionInformation");
   try{var actual=Marshal.PtrToStringUni(name);if(String.IsNullOrEmpty(actual))continue;if(s.id!=expected||s.state!=0||!String.Equals(actual,user,StringComparison.OrdinalIgnoreCase))return false;found=true;}finally{if(name!=IntPtr.Zero)WTSFreeMemory(name);}
  }return found;}finally{WTSFreeMemory(data);}
 }
}
'@
 }
 Assert-TandaUnattended
 $principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
 if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Capturas/lifecycle/hosts requieren token limitado; elevar solo el sampler preautorizado'}
}
function Assert-TandaUnattended {
 Assert-TandaWindow $NoAntesUtc $LimiteUtc
 if([TandaIdle]::Milliseconds() -lt 600000){throw 'Actividad de usuario en los últimos diez minutos'}
 if(-not [TandaIdle]::OnlyExpectedSession($Sesion,$Usuario)){throw 'Sesión ausente/adicional o usuario inesperado'}
}
function Invoke-TandaDryRun([string]$Root,[string]$Output){
 $env:VANTARE_SIN_GRAFICOS='1'
 Assert-TandaPython $PythonExe
 $manifest=Assert-TandaInputs $Root -DryValidation
 if(Test-Path -LiteralPath $Output){throw 'La salida del ensayo debe ser nueva'}
 $null=New-Item -ItemType Directory -Path $Output
 $env:VANTARE_SIN_GRAFICOS='1'
 $guard=Invoke-TandaProcess (Join-Path $Root 'bin/vantare-overlays-rune.exe') @('--capture-scene') (Join-Path $Output 'guard') 20
 if($guard.code -ne 6 -or $guard.stderr -notmatch '^GRAPHICS_DISABLED\b'){throw 'El binario no cumple el guard gráfico'}
 if(-not $SoloVisual){
  $list=Invoke-TandaProcess (Join-Path $Root 'bin/lifecycle-rune-tests.exe') @('--list','--ignored') (Join-Path $Output 'lifecycle-list') 20
  if($list.code -ne 0 -or @($list.stdout -split "`n"|Where-Object {$_ -match '^rune_[a-z_]+: test\s*$'}).Count -ne 4){throw 'No se enumeraron exactamente cuatro tests lifecycle, sin ejecutarlos'}
 }else{
  $import=Invoke-TandaProcess (Get-Process -Id $PID).Path @('-NoProfile','-File',(Join-Path $Root 'tools/qa-overlays/PROBAR_IMPORTAR_TANDA.ps1')) (Join-Path $Output 'importacion-falsa') 60
  if($import.code -ne 0){throw 'Las regresiones del importador de CI fallaron'}
 }
 $fake=Invoke-TandaProcess (Get-Process -Id $PID).Path @('-NoProfile','-File',(Join-Path $Root 'tools/qa-overlays/PROBAR_TANDA.ps1')) (Join-Path $Output 'controlador-falso') 90
 if($fake.code -ne 0){throw 'El ensayo del controlador falso falló'}
 $round=Invoke-TandaProcess (Get-Process -Id $PID).Path @('-NoProfile','-File',(Join-Path $Root 'tools/qa-overlays/PROBAR_RONDA.ps1')) (Join-Path $Output 'ronda-falsa') 30
 if($round.code -ne 0){throw 'El ensayo de la ronda real con procesos falsos falló'}
 $security=Invoke-TandaProcess (Get-Process -Id $PID).Path @('-NoProfile','-File',(Join-Path $Root 'tools/qa-overlays/PROBAR_SEGURIDAD.ps1')) (Join-Path $Output 'seguridad-falsa') 60
 if($security.code -ne 0){throw 'Regresiones de seguridad fallaron'}
 $credentialTests=Join-Path $Root 'tools/qa-overlays/PROBAR_CREDENCIAL_TANDA.ps1'
 $credential=Invoke-TandaProcess (Get-Process -Id $PID).Path @('-NoProfile','-File',$credentialTests) (Join-Path $Output 'credencial-falsa') 60
 if($credential.code -ne 0){throw 'Ensayo de credencial QA falló'}
 $csv=Invoke-TandaPython @('-m','unittest','discover','-s',(Join-Path $Root 'tools/qa-overlays'),'-p','test_*.py') (Join-Path $Output 'csv-falsos') 180
 if($csv.code -ne 0){throw 'Las regresiones de CSV falsos fallaron'}
 $result=@{source_sha=$manifest.source_sha;production_rights_configured=$manifest.production_rights_configured;guard_code=6;guard_token='GRAPHICS_DISABLED';input_hashes='PASS';captures=$manifest.captures.Count;measurements=$manifest.measurements.Count;gpu_executed=$false;shutdown_executed=$false;utc=[DateTime]::UtcNow.ToString('o')}
 if($SoloVisual){$result.ci_run_id=$manifest.ci_artifact.run_id;$result.lifecycle_executed=$false}
 Write-TandaJson $result (Join-Path $Output 'ensayo.json')
}
function Start-TandaOwned([string]$Image,[string[]]$Arguments,[string]$Log,[hashtable]$Environment=@{}){
 $info=[Diagnostics.ProcessStartInfo]::new($Image)
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 foreach($argument in $Arguments){$info.ArgumentList.Add($argument)}
 foreach($key in $Environment.Keys){$info.Environment[$key]=[string]$Environment[$key]}
 $p=[Diagnostics.Process]::new();$p.StartInfo=$info
 if(-not $p.Start()){throw 'No arrancó proceso propio'}
 @{process=$p;log=$Log;stdout=$p.StandardOutput.ReadToEndAsync();stderr=$null;prefix=''}
}
function Close-TandaOwned($Handle){
 if(-not $Handle){return}
 if($Handle.ContainsKey('closed') -and $Handle.closed){return}
 $p=$Handle.process
 try {
  if(-not $Handle.stderr){$Handle.stderr=$p.StandardError.ReadToEndAsync()}
  if(-not $p.HasExited){$p.StandardInput.Close()}
  if(-not $p.WaitForExit(5000)){$p.Kill($true);$p.WaitForExit()}
  [IO.File]::WriteAllText($Handle.log+'.stderr.txt',$Handle.prefix+$Handle.stderr.GetAwaiter().GetResult())
  [IO.File]::WriteAllText($Handle.log+'.stdout.txt',$Handle.stdout.GetAwaiter().GetResult())
 } finally {$p.Dispose();$Handle.closed=$true}
}
function Get-TandaLiveClock($Handle){
 $p=$Handle.process;$lines='';$until=[DateTime]::UtcNow.AddSeconds(15)
 $read=$p.StandardError.ReadLineAsync()
 while([DateTime]::UtcNow -lt $until){
  if($read.IsCompleted){
   $line=$read.GetAwaiter().GetResult()
   if($null -eq $line){throw 'Núcleo cerrado antes de datos Live'}
   $lines+=$line+"`n"
   if($line -match ' core .*->Live '){
    $Handle.prefix=$lines;$Handle.stderr=$p.StandardError.ReadToEndAsync()
    return [Diagnostics.Stopwatch]::GetTimestamp()
   }
   $read=$p.StandardError.ReadLineAsync()
  }
  Start-Sleep -Milliseconds 10
 }
 # Finish the outstanding read before a second reader/close is attempted.
 if(-not $p.HasExited){$p.StandardInput.Close()}
 if(-not $p.WaitForExit(5000)){$p.Kill($true);$p.WaitForExit()}
 $null=$read.GetAwaiter().GetResult()
 $Handle.prefix=$lines;$Handle.stderr=$p.StandardError.ReadToEndAsync()
 throw 'No llegó transición Live del replay; no medir una ventana vacía'
}
function Get-TandaReplayOrigin([string]$Log){
 $lines=@(Get-Content -LiteralPath $Log)
 $headers=@($lines|Where-Object {$_ -match '^trace frequency=\d+ overflow=\d+$'})
 if($headers.Count -ne 1 -or $headers[0] -notmatch '^trace frequency=(\d+) overflow=0$'){throw 'Traza del núcleo ausente/incompleta o desbordada'}
 $frequency=[long]$Matches[1]
 if($frequency -ne [Diagnostics.Stopwatch]::Frequency){throw 'QPC de núcleo distinto del muestreador'}
 $events=@($lines|Where-Object {$_ -match '^trace\t'})
 $ends=@($lines|Where-Object {$_ -match '^trace_end events=\d+$'})
 if($ends.Count -ne 1 -or $ends[0] -notmatch '^trace_end events=(\d+)$' -or [long]$Matches[1] -ne $events.Count){throw 'Traza truncada'}
 $observes=@($events|Where-Object {$_ -match '^trace\tspan\tobserve\t'}|ForEach-Object {[long]($_.Split("`t")[3])})
 if(-not $observes.Count -or @($observes|Where-Object {$_ -le 0}).Count -gt 0){throw 'No existe primera observación QPC válida'}
 ($observes|Measure-Object -Minimum).Minimum -as [long]
}
function Write-TandaFrame($Stream,$Value){
 $bytes=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Value -Depth 20 -Compress))
 if($bytes.Length -gt 131072){throw 'Frame Services excede contrato'}
 $prefix=[BitConverter]::GetBytes([uint32]$bytes.Length)
 $Stream.Write($prefix,0,4);$Stream.Write($bytes,0,$bytes.Length);$Stream.Flush()
}
function Read-TandaExact($Stream,[int]$Count){
 $bytes=[byte[]]::new($Count);$offset=0
 $cancel=[Threading.CancellationTokenSource]::new(5000)
 try {
  while($offset -lt $Count){
   $got=$Stream.ReadAsync($bytes,$offset,$Count-$offset,$cancel.Token).GetAwaiter().GetResult()
   if(-not $got){throw 'Frame local incompleto'};$offset+=$got
  }
 } finally {$cancel.Dispose()}
 ,$bytes
}
function Read-TandaFrame($Stream){
 $prefix=Read-TandaExact $Stream 4
 $count=[BitConverter]::ToUInt32($prefix,0)
 if($count -eq 0 -or $count -gt 131072){throw 'Frame local fuera de cota'}
 $bytes=Read-TandaExact $Stream ([int]$count)
 [Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json -AsHashtable -NoEnumerate
}
function Assert-TandaPolicy($Policy){
 $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
 if($Policy.version -ne 7 -or $Policy.revision -le 0 -or $Policy.state.kind -notin @('active','grace') -or $Policy.catalog -notin @('pro','founders')){throw 'Derechos reales no permiten los 19 widgets; no medir vacío'}
 if($now -lt $Policy.checked_at_ms -or $now-$Policy.checked_at_ms -ge 2000){throw 'Política de derechos no vigente'}
 $until=$Policy.grace_until_ms ?? $Policy.signed_until_ms
 if($null -ne $until -and $now -ge $until){throw 'Derechos caducados; no renovar ni simular acceso'}
}
function Read-TandaPolicy([string]$Root,[string]$PhotoPipe,[string]$Log){
 # Binario REAL de Services, misma base. ÚNICA operación LicenseStatus/Read.
 # No login, renew, mutación, credenciales copiadas ni identidades simuladas.
 $name='vantare-tanda-services-'+[guid]::NewGuid().ToString('N')
 $info=[Diagnostics.ProcessStartInfo]::new((Join-Path $Root 'bin/vantare-services.exe'))
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 # Perfil del AUXILIAR nuevo y vacío: no abrir cola/consentimiento de analítica
 # ni cuenta de Isaac. El núcleo real conserva su autoridad legítima.
 $qa=$Log+'.services-qa'
 $null=New-Item -ItemType Directory -Path $qa
 foreach($key in @('VANTARE_NATIVE_DATA_ROOT','LOCALAPPDATA','APPDATA')){$info.Environment[$key]=$qa}
 foreach($arg in @($name,[string]$PID,(Get-Process -Id $PID).Path,$qa,'--managed')){$info.ArgumentList.Add($arg)}
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info
 $pipe=$null;$stderr=$null;$started=$false
 try {
  if(-not $process.Start()){throw 'No arrancó lector real de derechos'};$started=$true
  $stderr=$process.StandardError.ReadToEndAsync()
  Write-TandaFrame $process.StandardInput.BaseStream @{pipe=($PhotoPipe+'-rights');image=(Join-Path $Root 'bin/vantare-core.exe');nonce=''}
  $nonceTask=$process.StandardOutput.ReadLineAsync()
  if(-not $nonceTask.Wait(5000)){throw 'Timeout de enlace local de Services'}
  $nonce=$nonceTask.GetAwaiter().GetResult()
  if(-not $nonce){throw 'Services no abrió el enlace local'}
  # Nonce efímero solo en memoria. Nunca entra en logs, CLI o evidencia.
  $pipe=[IO.Pipes.NamedPipeClientStream]::new('.',$name,[IO.Pipes.PipeDirection]::InOut,[IO.Pipes.PipeOptions]::Asynchronous)
  $pipe.Connect(5000)
  Write-TandaFrame $pipe @{version=20;sequence=1;nonce=$nonce;command=@{command='LicenseStatus'}}
  $response=Read-TandaFrame $pipe
  $nonce=$null
  if($response.version -ne 20 -or $response.sequence -ne 1 -or $response.reply.result -ne 'License'){throw 'Respuesta de Services incompatible; no degradar a lectura de archivos'}
  $policy=$response.reply.policy
  Write-TandaJson (Convert-TandaPolicyEvidence $policy) $Log
  Assert-TandaPolicy $policy
  $policy
 } finally {
  if($pipe){$pipe.Dispose()}
  if($started){
   if(-not $process.HasExited){$process.StandardInput.Close()}
   if(-not $process.WaitForExit(5000)){$process.Kill($true);$process.WaitForExit()}
   if($stderr){[IO.File]::WriteAllText($Log+'.services.stderr.txt',$stderr.GetAwaiter().GetResult())}
  }
  $process.Dispose()
 }
}
function Invoke-TandaMeasurement([string]$Root,[string]$Output,$Case,[hashtable]$License){
 if(-not $License){throw 'QA_MEASUREMENT_LICENSE_MISSING: falta la credencial firmada autorizada'}
 . (Join-Path $Root 'tools/qa-overlays/OBSERVAR.ps1')
 $round=Join-Path $Output ('perf/'+$Case.id)
 $null=New-Item -ItemType Directory -Path $round
 $layout=Join-Path $round 'layout.json'
 Copy-Item -LiteralPath (Resolve-TandaPath $Root $Case.layout) -Destination $layout
 Copy-Item -LiteralPath $layout -Destination (Join-Path $round 'layout-inicial.json')
 $pipe='vantare-tanda-'+[guid]::NewGuid().ToString('N')
 $core=$null;$hostRun=$null;$sampler=$null
 $profileRoots=@(Get-TandaProfileRoots)
 $profileBefore=@(Get-TandaProfileSnapshot $profileRoots)
 Write-TandaJson $profileBefore (Join-Path $round 'perfil-antes.json')
 $hostEnvironment=New-TandaQaEnvironment (Join-Path $round 'qa-host')
 $profileBase=Join-Path (Split-Path $Output -Parent) 'qa-core'
 $coreProfile=Join-Path $profileBase ('round-'+[guid]::NewGuid().ToString('N'))
 if(Test-Path -LiteralPath $coreProfile){throw 'QA_PROFILE_EXISTS: no se reutiliza un perfil'}
 try {
  # This sibling is outside the evidence tree that is archived and copied.
  $coreEnvironment=Install-TandaQaCredential $License.cli $License.credential $License.registry $License.key_id $coreProfile
  $coreEnvironment['VANTARE_PROFILE_PHASES']='1'
  $coreEnvironment['VANTARE_MEASUREMENT_TRACE']='1'
  # Preparar ETW/Add-Type ANTES del replay, sin consumir sus cinco segundos.
  $rootInfo=Join-Path $round 'root-info.json'
  if($Case.state -eq 'replay'){
   $sampler=Start-TandaSampler $Root $round $Case
   $ready=Join-Path $round 'muestreo/CAPTURA-LISTA.json'
   $deadline=[DateTime]::UtcNow.AddSeconds(20)
   while(-not(Test-Path -LiteralPath $ready)){
    Assert-TandaUnattended
    if((Test-TandaSamplerFinished $sampler) -or [DateTime]::UtcNow -ge $deadline){throw 'Sampler/ETW no está listo; no arrancar replay ni host'}
    Start-Sleep -Milliseconds 50
   }
   if(-not (Read-TandaJson $ready).ready){throw 'Sampler no confirmó ETW listo'}
  }
  $argsCore=if($Case.state -eq 'replay'){@('--replay',(Join-Path $Root 'inputs/lmu47-high-rate-60s.tar.gz'),'--velocidad','1','--pipe',$pipe)}else{@('--live','--simulator','lmu','--pipe',$pipe)}
  $launchQpc=[Diagnostics.Stopwatch]::GetTimestamp()
  $core=Start-TandaOwned (Join-Path $Root 'bin/vantare-core.exe') $argsCore (Join-Path $round 'core') $coreEnvironment
  $observed=if($Case.state -eq 'replay'){Get-TandaLiveClock $core}else{0}
  if(-not $core.stderr){$core.stderr=$core.process.StandardError.ReadToEndAsync()}
  $null=Read-TandaPolicy $Root $pipe (Join-Path $round 'rights-before.json')
  Assert-TandaUnattended
  $image=if($Case.motor -eq 'rune'){'vantare-overlays-rune.exe'}else{'vantare-overlays.exe'}
  $hostStartQpc=[Diagnostics.Stopwatch]::GetTimestamp()
  $hostRun=Start-TandaOwned (Join-Path $Root ('bin/'+$image)) @('--layout',$layout,'--fuente',('pipe:'+$pipe),'--control-stdin') (Join-Path $round 'overlay') $hostEnvironment
  $hostRun.stderr=$hostRun.process.StandardError.ReadToEndAsync()
  $identity=Get-VantareObservedIdentity $hostRun.process.Id
  Write-TandaJson $identity (Join-Path $round 'identidad.json')
  if($Case.state -eq 'waiting'){
   $sampler=Start-TandaSampler $Root $round $Case
   $ready=Join-Path $round 'muestreo/CAPTURA-LISTA.json'
   $deadline=[DateTime]::UtcNow.AddSeconds(20)
   while(-not(Test-Path -LiteralPath $ready)){
    Assert-TandaUnattended
    if((Test-TandaSamplerFinished $sampler) -or [DateTime]::UtcNow -ge $deadline){throw 'Sampler Waiting no está listo'}
    Start-Sleep -Milliseconds 50
   }
  }
  $rootData=@{};foreach($key in $identity.Keys){$rootData[$key]=$identity[$key]};$rootData.start_qpc=$hostStartQpc
  Write-TandaJson $rootData ($rootInfo+'.tmp')
  [IO.File]::Move($rootInfo+'.tmp',$rootInfo)
  $until=[DateTime]::UtcNow.AddSeconds(100)
  while(-not(Test-TandaSamplerFinished $sampler)){
   Start-Sleep -Milliseconds 500
   # No lanzar consultas CIM/PDH en cada muestra de rendimiento.
   Assert-TandaUnattended
   if([DateTime]::UtcNow -ge $until){throw 'Timeout sampler'}
  }
  if((Get-TandaSamplerExitCode $sampler) -ne 0){throw 'Sampler inválido; conservar CSV'}
  $after=Get-VantareObservedIdentity $hostRun.process.Id
  Write-TandaJson $after (Join-Path $round 'identidad-despues.json')
  foreach($field in @('process_id','created_utc','image_name','image_sha256')){if($identity[$field] -cne $after[$field]){throw "Cambió identidad: $field"}}
  $null=Read-TandaPolicy $Root $pipe (Join-Path $round 'rights-after.json')
  # La traza existente se vuelca al cerrar, fuera de la ventana medida. El QPC
  # se tomó dentro de Core::observe; no inferirlo de la llegada de stderr.
  Close-TandaOwned $core;$core=$null
  $anchor=if($Case.state -eq 'replay'){Get-TandaReplayOrigin (Join-Path $round 'core.stderr.txt')}else{0}
  Write-TandaJson @{core_launch_qpc=$launchQpc;first_live_log_observed_qpc=$observed;first_core_observe_qpc=$anchor;frequency=[Diagnostics.Stopwatch]::Frequency;
   origin=if($Case.state -eq 'replay'){'Primer span observe del núcleo (paint-stats, idéntico en ambos motores)'}else{'Waiting: CAPTURA-LISTA del sampler, después del arranque del host'};
   core_launch_to_first_observe_s=if($anchor){($anchor-$launchQpc)/[Diagnostics.Stopwatch]::Frequency}else{$null};
   limitations='No es el reloj normalizado del inventario. Traza solo del núcleo, buffered; no se añade instrumentación ni E/S por frame al overlay.'} (Join-Path $round 'origen.json')
 } finally {
  # Retirar ventanas inmediatamente si aparece actividad; no dejarlas visibles
  # mientras PresentMon completa su cierre temporizado y StopOwned.
  $cleanupErrors=[Collections.Generic.List[string]]::new()
  try {
   foreach($owned in @($hostRun,$core)){
    try {Close-TandaOwned $owned} catch {$cleanupErrors.Add($_.Exception.Message)}
   }
   # No omitir el cierre del sampler porque haya fallado el cierre de un host.
   try {Close-TandaSampler $sampler} catch {$cleanupErrors.Add($_.Exception.Message)}
   try {Remove-TandaQaRoundProfile $coreProfile $profileBase} catch {$cleanupErrors.Add($_.Exception.Message)}
  } finally {
   $profileAfter=@(Get-TandaProfileSnapshot $profileRoots)
   Write-TandaJson $profileAfter (Join-Path $round 'perfil-despues.json')
   Assert-TandaProfileUnchanged $profileBefore $profileAfter
  }
  if($cleanupErrors.Count){throw ('ROUND_CLOSE_FAILED: '+($cleanupErrors -join '; '))}
 }
  $analysis=Invoke-TandaPython @((Join-Path $Root 'tools/qa-overlays/medidas.py'),(Join-Path $round 'muestreo'),(Join-Path $round 'identidad.json'),(Join-Path $round 'resultado.json'),[string]$anchor) (Join-Path $round 'analisis') 30
  if($analysis.code -ne 0){throw 'Ventana QPC/CSV inválida; no fabricar números'}
}
function Invoke-TandaLifecycle([string]$Root,[string]$Output){
 Assert-TandaUnattended
 $directory=Join-Path $Output 'lifecycle'
 $null=New-Item -ItemType Directory -Path (Join-Path $directory 'tmp') -Force
 $names=@('VANTARE_RUNE_OVERLAYS_EXE','VANTARE_LIFECYCLE_HARNESS','VANTARE_LIFECYCLE_LAUNCHER_EXE','VANTARE_LIFECYCLE_KEEP_ARTIFACTS','TEMP','TMP','PATH','VANTARE_NATIVE_DATA_ROOT','LOCALAPPDATA','APPDATA')
 $prior=@{}
 foreach($name in $names){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
 try {
  $env:VANTARE_RUNE_OVERLAYS_EXE=Join-Path $Root 'bin/vantare-overlays-rune.exe'
  $env:VANTARE_LIFECYCLE_HARNESS=Join-Path $Root 'bin/lifecycle-harness.exe'
  $env:VANTARE_LIFECYCLE_LAUNCHER_EXE=Join-Path $Root 'bin/vantare.exe'
  $env:VANTARE_LIFECYCLE_KEEP_ARTIFACTS='1'
  $env:PATH=(Join-Path $Root 'bin')+[IO.Path]::PathSeparator+$env:PATH
  $env:TEMP=Join-Path $directory 'tmp';$env:TMP=$env:TEMP
  foreach($name in @('VANTARE_NATIVE_DATA_ROOT','LOCALAPPDATA','APPDATA')){
   $qa=Join-Path $directory $name;$null=New-Item -ItemType Directory -Path $qa -Force
   [Environment]::SetEnvironmentVariable($name,$qa,'Process')
  }
  if($SoloVisual){
   $scenarios=@()
   foreach($scenario in @('eof','restart','exit-zero','single')){
    Assert-TandaUnattended
    $result=Invoke-TandaProcess (Join-Path $Root 'bin/lifecycle.exe') @('rune-lifecycle',$scenario) (Join-Path $directory $scenario) 150 -WatchSession
    $scenarios+=@{name=$scenario;code=$result.code;stdout=$result.stdout;stderr=$result.stderr}
    Write-TandaJson @{scenarios=$scenarios;selector='--overlays-bin';measurement=$false;scenario_core='synthetic lifecycle fixture'} (Join-Path $directory 'resultado.json')
    if($result.code -ne 0){throw "LIFECYCLE_FAILED: $scenario"}
   }
  }else{
   $result=Invoke-TandaProcess (Join-Path $Root 'bin/lifecycle-rune-tests.exe') @('--ignored','--test-threads=1','--nocapture') (Join-Path $directory 'tests') 600 -WatchSession
   Write-TandaJson @{code=$result.code;stdout=$result.stdout;stderr=$result.stderr;selector='--overlays-bin';measurement=$false;scenario_core='synthetic lifecycle fixture, not LMU performance'} (Join-Path $directory 'resultado.json')
   if($result.code -ne 0 -or $result.stdout -notmatch '4 passed; 0 failed'){throw 'LIFECYCLE_FAILED: consultar lifecycle/tests y resultado.json'}
  }
 } finally {
  foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}
 }
}
function Invoke-TandaWorker([string]$Root,[string]$Output,[hashtable]$License){
 Assert-TandaWindow $NoAntesUtc $LimiteUtc
 Assert-TandaSession $Sesion $Usuario
 $manifest=Assert-TandaInputs $Root
 Assert-TandaPython $PythonExe
 if(Test-Path -LiteralPath $Output){throw 'Salida ya existe'}
 $null=New-Item -ItemType Directory -Path $Output
 foreach($dir in @('logs','gpui','rune','diff','perf','pares','texto')){$null=New-Item -ItemType Directory -Path (Join-Path $Output $dir)}
 Copy-Item -LiteralPath (Join-Path $Root 'manifiesto.json') -Destination (Join-Path $Output 'manifiesto-usado.json')
 $captureEnvironment=@{}
 foreach($name in @('VANTARE_NATIVE_DATA_ROOT','LOCALAPPDATA','APPDATA')){
  $qa=Join-Path $Output ('capture-data/'+$name);$null=New-Item -ItemType Directory -Path $qa -Force
  $captureEnvironment[$name]=$qa
 }
 $state=@{source_sha=$manifest.source_sha;status='running';completed_without_error=$false;captures=@();measurements=@()}
 if($SoloVisual){$state.scope='visual-lifecycle'}
 try {
  $python=Invoke-TandaPython @('-c','import sys, PIL, numpy; print(sys.version); print(PIL.__version__); print(numpy.__version__)') (Join-Path $Output 'logs/python-preflight') 30
  if($python.code -ne 0){throw 'BLOCKED_PYTHON: faltan Python/Pillow/numpy ya instalados; no instalar durante la tanda'}
  foreach($case in $manifest.captures){
   Assert-TandaWindow $NoAntesUtc $LimiteUtc;Assert-TandaSession $Sesion $Usuario
   $id=$case.id
   $rune=Invoke-TandaProcess (Join-Path $Root 'bin/vantare-overlays-rune.exe') @('--capture-scene','--layout',(Resolve-TandaPath $Root $case.layout),'--sequence',(Resolve-TandaPath $Root $case.sequence),'--at-ms',[string]$case.at_ms,'--motion',([string]$case.motion).ToLowerInvariant(),'--wall-ms',[string]$case.wall_ms,'--scale',[string]$case.scale,'--output',(Join-Path $Output "rune/$id.png")) (Join-Path $Output "logs/$id-rune") -WatchSession -Environment $captureEnvironment
   $tokens=@{0='OK';2='INVALID_INPUT';3='NO_DEMO';4='GPU_UNAVAILABLE';5='CAPTURE_FAILED';6='GRAPHICS_DISABLED'}
   $token=if($tokens.ContainsKey([int]$rune.code)){$tokens[[int]$rune.code]}else{'UNEXPECTED_EXIT'}
   $state.captures+=@{id=$id;motor='rune';code=$rune.code;expected_token=$token;stderr=$rune.stderr}
   if($token -eq 'UNEXPECTED_EXIT' -or $rune.stderr -notmatch ('(?m)^'+[regex]::Escape($token)+'\b')){throw 'Código/token de Rune no cumple contrato'}
   if($rune.code -in @(4,6)){throw "${token}: abortar sin apagado"}
   if($rune.code -ne 0){throw "${token}: captura Rune fallida, abortar sin apagado"}
   if($rune.code -eq 0){$state.captures[-1].actual_png_size=Read-TandaPngSize (Join-Path $Output "rune/$id.png")}
   $batch=Join-Path $Output "logs/$id-batch.json"
   Write-TandaJson @(@{scene=(Resolve-TandaPath $Root $case.scene);output=(Join-Path $Output "gpui/$id.png");widget=$case.kind;settings=(Read-TandaJson (Resolve-TandaPath $Root $case.settings));parameters=@{language='es'}}) $batch
   $gpui=Invoke-TandaProcess (Join-Path $Root 'bin/vantare-overlays.exe') @('--capture-batch',$batch) (Join-Path $Output "logs/$id-gpui") -WatchSession -Environment $captureEnvironment
   $state.captures+=@{id=$id;motor='gpui';code=$gpui.code;stderr=$gpui.stderr}
   if($gpui.code -ne 0){throw 'CAPTURE_FAILED: GPUI no produjo la captura, abortar sin apagado'}
   if($gpui.code -eq 0){$state.captures[-1].actual_png_size=Read-TandaPngSize (Join-Path $Output "gpui/$id.png")}
   if($rune.code -eq 0 -and $gpui.code -eq 0){
    $diff=Invoke-TandaPython @((Join-Path $Root 'diff.py'),(Join-Path $Output "rune/$id.png"),(Join-Path $Output "gpui/$id.png"),'--threshold','8','--max-percent','4.9999','--json','--out',(Join-Path $Output "diff/$id.png")) (Join-Path $Output "diff/$id") 90
    $state.captures+=@{id=$id;motor='diff';code=$diff.code;text_review='PENDIENTE revisión humana de PNG/pareja al 100 %; no aprobar solo por porcentaje'}
    $pair=Invoke-TandaPython @((Join-Path $Root 'tools/qa-overlays/pareja_tanda.py'),(Join-Path $Output "gpui/$id.png"),(Join-Path $Output "rune/$id.png"),(Join-Path $Output "pares/$id.png"),(Join-Path $Output "texto/$id.txt")) (Join-Path $Output "logs/$id-pareja") 60
    if($pair.code -ne 0){throw 'No se pudo guardar la pareja/revisión separada de texto'}
   }
  }
  Assert-TandaWindow $NoAntesUtc $LimiteUtc;Assert-TandaSession $Sesion $Usuario
  Invoke-TandaLifecycle $Root $Output
  $state.lifecycle='4 passed; 0 failed'
  $measurementCases=if(-not $SoloVisual){$manifest.measurements}
  foreach($case in $measurementCases){
   Assert-TandaWindow $NoAntesUtc $LimiteUtc;Assert-TandaSession $Sesion $Usuario
   try {Invoke-TandaMeasurement $Root $Output $case $License;$state.measurements+=@{id=$case.id;status='complete'}}
   catch {$state.measurements+=@{id=$case.id;status='invalid';error=$_.Exception.Message};throw}
  }
  $state.status='complete'
 } catch {$state.status='aborted';$state.error=$_.Exception.Message}
 finally {
  $state.cleanup_attempted=$true
  $state.completed_without_error=($state.status -eq 'complete')
  $state.text_review='PENDIENTE; ejecución completa no equivale a paridad aprobada'
  @('# Revisión de texto — PENDIENTE','','Revisar parejas a tamaño real: mismo contenido/elipsis, baseline, tracking, sombra y recorte. No excluir texto del diff ni aprobar solo por <5 %.','') + @($manifest.captures|ForEach-Object {"- [ ] $($_.id): [GPUI](../gpui/$($_.id).png) | [Rune](../rune/$($_.id).png) | [pareja](../pares/$($_.id).png). Puede faltar PNG si falló la CLI; consultar estado/logs."}) | Set-Content -LiteralPath (Join-Path $Output 'texto/REVISION.md') -Encoding utf8
  Write-TandaJson $state (Join-Path $Output 'estado.json')
  Write-TandaEvidenceHashes $Output
 }
}
function Invoke-TandaSsh([string]$Target,[string]$Code){
 $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Code))
 $result=& ssh -o BatchMode=yes -o ConnectTimeout=15 $Target "pwsh -NoProfile -EncodedCommand $encoded"
 if($LASTEXITCODE){throw 'SSH falló; nunca apagar sin evidencia verificada'}
 $result -join "`n"
}
function Invoke-TandaServer([string]$Root){
 Assert-TandaWindow $NoAntesUtc $LimiteUtc
 if(-not $SoloVisual){Assert-TandaMachineRegistry}
 Assert-TandaPython $PythonExe -SyntaxOnly
 $manifest=Assert-TandaInputs $Root
 if($Pc -notmatch '^isaac@100\.83\.142\.118$' -or $Usuario -ne 'isaac'){throw 'Destino/usuario fuera de autorización'}
 $sessionInfo=Invoke-TandaSsh $Pc '$ErrorActionPreference="Stop";$u=(Get-CimInstance Win32_ComputerSystem).UserName;$e=@(Get-Process explorer -ErrorAction SilentlyContinue|Select-Object -ExpandProperty SessionId -Unique);@{user=$u;sessions=$e}|ConvertTo-Json -Compress'|ConvertFrom-Json -AsHashtable
 if(-not $sessionInfo.user -or ($sessionInfo.user -split '\\')[-1] -ine $Usuario -or $sessionInfo.sessions.Count -ne 1){throw 'Sin sesión única legítima: abortar sin copiar/lanzar/apagar'}
 $script:Sesion=[int]$sessionInfo.sessions[0]
 $stamp=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
 $remote="C:/VantareQA/tanda-$stamp"
 $destination=Join-Path $DestinoServidor "tanda-pc-$stamp-$($manifest.source_sha.Substring(0,9))"
 if(Test-Path -LiteralPath $destination){throw 'Destino de evidencia ya existe'}
 $null=Invoke-TandaSsh $Pc "if(Test-Path '$remote'){throw 'Ruta ya existe'};New-Item -ItemType Directory '$remote'|Out-Null"
 & scp -q -r $Root "${Pc}:$remote/kit"
 if($LASTEXITCODE){throw 'Copia del kit falló; no apagar'}
 $task="Vantare-tanda-$stamp"
 $start=$NoAntesUtc;$end=$LimiteUtc
 $action="-NoProfile -WindowStyle Hidden -File $remote/kit/TANDA.ps1 -Modo Trabajador -Kit $remote/kit -Salida $remote/evidence -Sesion $Sesion -Usuario isaac -NoAntesUtc $start -LimiteUtc $end -SamplerTaskPrefix $task -PythonExe `"$PythonExe`""
 if($SoloVisual){$action+=' -SoloVisual'}
 $registered=@()
 try {
  $samplerDefinitions=if(-not $SoloVisual){Get-TandaSamplerDefinitions ($remote+'/kit') ($remote+'/evidence') $task $manifest.measurements}
  foreach($definition in $samplerDefinitions){
   $null=Invoke-TandaSsh $Pc "`$a=New-ScheduledTaskAction -Execute (Get-Command pwsh).Source -Argument '$($definition.arguments)';`$p=New-ScheduledTaskPrincipal -UserId 'isaac' -LogonType Interactive -RunLevel Highest;Register-ScheduledTask -TaskName '$($definition.name)' -Action `$a -Principal `$p|Out-Null"
   $registered+= $definition.name
  }
  $null=Invoke-TandaSsh $Pc "`$ErrorActionPreference='Stop';`$a=New-ScheduledTaskAction -Execute (Get-Command pwsh).Source -Argument '$action';`$p=New-ScheduledTaskPrincipal -UserId 'isaac' -LogonType Interactive -RunLevel Limited;Register-ScheduledTask -TaskName '$task' -Action `$a -Principal `$p|Out-Null;Start-ScheduledTask -TaskName '$task'"
  $registered+=$task
  do {
   if([DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($LimiteUtc)){throw 'Fin de ventana: no apagar'}
   Start-Sleep -Seconds 10
   $ready=Invoke-TandaSsh $Pc "Test-Path '$remote/evidence/evidence-hashes.json'"
   if($ready.Trim() -ne 'True'){
    $taskState=Invoke-TandaSsh $Pc "`$t=Get-ScheduledTask -TaskName '$task';`$i=Get-ScheduledTaskInfo -TaskName '$task';@{state=[string]`$t.State;code=`$i.LastTaskResult}|ConvertTo-Json -Compress"|ConvertFrom-Json -AsHashtable
    if($taskState.state -ne 'Running' -and $taskState.code -ne 267009){throw "Trabajador no produjo evidencia: código $($taskState.code); no apagar"}
   }
  } until($ready.Trim() -eq 'True')
  $archive="$remote/evidence.tar"
  $expected=Invoke-TandaSsh $Pc "& tar -cf '$archive' -C '$remote/evidence' .;if(`$LASTEXITCODE){throw 'tar fallo'};(Get-FileHash '$archive' -Algorithm SHA256).Hash"
  $temp=Join-Path $DestinoServidor ('.tanda-'+$stamp+'.tar')
  if(Test-Path -LiteralPath $temp){throw 'Descarga temporal ya existe'}
  & scp -q "${Pc}:$archive" $temp
  if($LASTEXITCODE -or (Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash -ine $expected.Trim()){throw 'Copia de evidencia no verificada: no apagar'}
  Expand-TandaEvidence $temp $destination
  foreach($file in (Read-TandaJson (Join-Path $destination 'evidence-hashes.json'))){
   $path=Resolve-TandaPath $destination $file.path
   if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $file.sha256){throw 'Hash de evidencia incorrecto: no apagar'}
  }
  $state=Read-TandaJson (Join-Path $destination 'estado.json')
  if($state.status -ne 'complete' -or -not $state.completed_without_error){throw 'Tanda abortada: evidencia copiada, no apagar'}
  if($SoloVisual -and ($state.scope -cne 'visual-lifecycle' -or $state.source_sha -cne $manifest.source_sha -or $state.measurements.Count -ne 0 -or $state.lifecycle -cne '4 passed; 0 failed' -or $state.captures.Count -ne (3*$manifest.captures.Count))){
   throw 'Evidencia visual/lifecycle incompleta o de otra tanda: no apagar'
  }
  # ACK solo tras verificar archivo y hashes de CADA fichero en servidor.
  $hash=(Get-FileHash -LiteralPath (Join-Path $destination 'evidence-hashes.json') -Algorithm SHA256).Hash
  $null=Invoke-TandaSsh $Pc "if(Test-Path '$remote/evidence/copia-servidor.json'){throw 'ACK ya existe'};@{verified=`$true;hash_manifest='$hash';destination='$destination'}|ConvertTo-Json|Set-Content '$remote/evidence/copia-servidor.json' -Encoding utf8"
  $finish=$action.Replace('-Modo Trabajador','-Modo Apagar')
  $null=Invoke-TandaSsh $Pc "`$a=New-ScheduledTaskAction -Execute (Get-Command pwsh).Source -Argument '$finish';Set-ScheduledTask -TaskName '$task' -Action `$a|Out-Null;Start-ScheduledTask -TaskName '$task'"
  $until=[DateTime]::UtcNow.AddSeconds(75)
  do {
   Start-Sleep -Seconds 1
   $ack=Invoke-TandaSsh $Pc "if(Test-Path '$remote/evidence/apagado.json'){Get-Content '$remote/evidence/apagado.json' -Raw}"
  } until($ack -or [DateTime]::UtcNow -ge $until)
  if(-not $ack){throw 'No hay confirmación interactiva de apagado; evidencia preservada'}
  $ack|Set-Content -LiteralPath (Join-Path $destination 'apagado.json') -Encoding utf8
  if(-not ($ack|ConvertFrom-Json -AsHashtable).accepted){throw 'Apagado rechazado por la comprobación interactiva'}
 } finally { foreach($name in $registered){$null=Invoke-TandaSsh $Pc "Unregister-ScheduledTask -TaskName '$name' -Confirm:`$false -ErrorAction SilentlyContinue"} }
}
function Invoke-TandaShutdown([string]$Root,[string]$Output){
 if($env:VANTARE_SIN_GRAFICOS -eq '1' -or $env:COMPUTERNAME -ieq 'SAPPHIREOS'){throw 'GRAPHICS_DISABLED: nunca apagar el servidor'}
 $result=@{accepted=$false;utc=[DateTime]::UtcNow.ToString('o')}
 try {
  Assert-TandaWindow $NoAntesUtc $LimiteUtc
  Assert-TandaSession $Sesion $Usuario
  Assert-TandaShutdownEvidence $Output
  $result=Invoke-TandaShutdownCountdown {
   param($Arguments) & shutdown @Arguments
   if($LASTEXITCODE){throw 'shutdown rechazado'}
  } {
   & shutdown /a
   if($LASTEXITCODE){throw 'No se pudo cancelar shutdown'}
  } {
   Assert-TandaUnattended
   # No slow CIM query may delay the input watcher near the shutdown deadline.
   Assert-TandaNoGames -NamesOnly
  } {param($Milliseconds) Start-Sleep -Milliseconds $Milliseconds} {
   [Diagnostics.Stopwatch]::GetTimestamp()/[double][Diagnostics.Stopwatch]::Frequency
  }
 } catch {$result.error=$_.Exception.Message}
 Write-TandaJson $result (Join-Path $Output 'apagado.json')
}
if($SoloFunciones){return}
if(-not $SoloVisual -and $Modo -in @('Servidor','Trabajador','Apagar')){
 throw 'BLOCKED_MEASUREMENT_AUTHORIZATION: falta el preflight de autorización de L3; usar el kit visual para la cita'
}
switch($Modo){
 'Validar' {if(-not $SoloVisual){Assert-TandaMachineRegistry};$null=Assert-TandaInputs $Kit; 'PASS: entradas/rutas/hashes/TSV'}
 'Ensayo' {if(-not $Salida){throw 'Falta -Salida nueva'};Invoke-TandaDryRun $Kit $Salida}
 'VerificarCustodiaQA' {
  if($SoloVisual -or -not $ZipQA -or $ZipSha256QA -cnotmatch '\A[0-9a-f]{64}\z' -or -not $LogsQA.Count){
   throw 'Se requieren árbol de medición, ZIP, SHA-256 verificado del ZIP y logs del ensayo'
  }
  $key=Get-TandaServerQaPrivatePath $KeyIdQA
  Assert-TandaPython $PythonExe
  # Use the operator's own checked-out script, never code from the package under scan.
  $scanner=Join-Path $PSScriptRoot 'preflight_privado.py'
  & $PythonExe -I $scanner --private-key $key --kit-zip $ZipQA --kit-zip-sha256 $ZipSha256QA $Kit @LogsQA
  if($LASTEXITCODE){throw 'QA_PRIVATE_PREFLIGHT_FAILED'}
 }
 'FirmarCredencialQA' {
  if($SoloVisual -or $env:VANTARE_SIN_GRAFICOS -eq '1'){throw 'QA_SIGN_FORBIDDEN: solo firma explícita, fuera de la tanda visual o del ensayo'}
  $image=Resolve-TandaPath $Kit 'bin/vantare-qa-license.exe'
  New-TandaSignedCredential $image $FingerprintQA $KeyIdQA $CliSha256QA
 }
 'Trabajador' {if(-not $Salida){throw 'Falta -Salida nueva'};Invoke-TandaWorker $Kit $Salida}
 'Servidor' {Invoke-TandaServer $Kit}
 'Apagar' {if(-not $Salida){throw 'Falta salida de evidencia'};Invoke-TandaShutdown $Kit $Salida}
}

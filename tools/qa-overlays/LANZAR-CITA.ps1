#requires -Version 7
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$Cita,
 [Parameter(Mandatory)][ValidatePattern('\A[0-9a-fA-F]{64}\z')][string]$CitaSha256
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

function Assert-CitaPlainPath([string]$Path){
 if(-not [IO.Path]::IsPathFullyQualified($Path)){throw 'Ruta de cita no absoluta'}
 $item=Get-Item -LiteralPath $Path -Force
 while($item){
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Ruta de cita con enlace'}
  $item=if($item -is [IO.FileInfo]){$item.Directory}else{$item.Parent}
 }
}

function Read-CitaUtc([string]$Value){
 [DateTimeOffset]::ParseExact($Value,"yyyy-MM-ddTHH:mm:ss'Z'",[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal)
}

function Assert-CitaKit($Config){
 $hash=(Get-FileHash -LiteralPath $Config.zip -Algorithm SHA256).Hash.ToLowerInvariant()
 $result.zip_actual=$hash
 if($hash -cne $Config.zip_sha256){throw 'SHA-256 del ZIP distinto'}
 $root=[IO.Path]::GetFullPath($Config.kit)
 $archive=[IO.Compression.ZipFile]::OpenRead($Config.zip)
 try{
  $files=[Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
  $pending=[Collections.Generic.Stack[IO.DirectoryInfo]]::new()
  $pending.Push([IO.DirectoryInfo]::new($root))
  while($pending.Count){
   foreach($item in $pending.Pop().EnumerateFileSystemInfos()){
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Staging con enlace'}
    if($item -is [IO.DirectoryInfo]){$pending.Push($item);continue}
    $relative=[IO.Path]::GetRelativePath($root,$item.FullName).Replace('\','/')
    $files.Add($relative,$item.FullName)
   }
  }
  $verified=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach($entry in $archive.Entries){
   if($entry.FullName.EndsWith('/')){continue}
   $relative=$entry.FullName
   $path=''
   if(-not $files.TryGetValue($relative,[ref]$path) -or -not $verified.Add($relative)){throw "Ruta de ZIP ausente o duplicada: $relative"}
   $stream=$entry.Open()
   try{$expected=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream))}finally{$stream.Dispose()}
   $stream=[IO.File]::OpenRead($path)
   try{$actual=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream))}finally{$stream.Dispose()}
   if($actual -cne $expected){throw "Staging distinto del ZIP: $relative"}
   if($relative -ceq 'TANDA.ps1'){$result.tanda_sha256=$expected.ToLowerInvariant()}
  }
  if($verified.Count -ne $files.Count){throw 'Archivo ajeno al ZIP en staging'}
  if(-not $verified.Contains('TANDA.ps1') -or -not $verified.Contains('manifiesto.json')){throw 'ZIP sin controlador o manifiesto'}
 }finally{$archive.Dispose()}
 $manifest=Get-Content -LiteralPath (Join-Path $root 'manifiesto.json') -Raw|ConvertFrom-Json -AsHashtable
 if($manifest.source_sha -cne $Config.source_sha -or $manifest.scope -cne 'visual-lifecycle' -or $manifest.measurements.Count -ne 0 -or $manifest.captures.Count -ne 223){
  throw 'El kit no corresponde a la cita visual autorizada'
 }
 $result.manifest_sha256=(Get-FileHash -LiteralPath (Join-Path $root 'manifiesto.json') -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-CitaNotCancelled {
 $directory=Get-Item -LiteralPath 'D:/VantareServer/qa' -ErrorAction Stop
 if(-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'No se puede comprobar CITA-CANCELAR'}
 if(@($directory.EnumerateFileSystemInfos('CITA-CANCELAR')).Count -or
    ($dry -and (Test-Path -LiteralPath (Join-Path $config.output 'CITA-CANCELAR')))){
  throw 'CITA-CANCELAR activo'
 }
}

Assert-CitaPlainPath $Cita
$configBytes=[IO.File]::ReadAllBytes($Cita)
$actualConfig=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($configBytes))
if($actualConfig -ine $CitaSha256){throw 'Configuración distinta de la fijada en la tarea'}
try{
 $document=[Text.Json.JsonDocument]::Parse([Text.Encoding]::UTF8.GetString($configBytes))
 try{
  $config=@{}
  foreach($property in $document.RootElement.EnumerateObject()){
   $config.Add($property.Name,$property.Value.GetString())
  }
 }finally{$document.Dispose()}
 Assert-CitaPlainPath $config.output
 if(-not (Get-Item -LiteralPath $config.output).PSIsContainer){throw 'La ruta de resultados no es una carpeta'}
}catch{
 $base=Join-Path 'D:/VantareServer/evidence/overlays-rune' ('RESULTADO-CITA-'+$actualConfig.Substring(0,16))
 $reason=$_.Exception.Message
 $failed=[ordered]@{status='ABORTADO';reason=$reason;config_sha256=$actualConfig.ToLowerInvariant();log="$base.log";preflight_exit=$null;tanda_exit=$null}
 if(-not (Test-Path -LiteralPath "$base.json")){
  Set-Content -LiteralPath "$base.log" -Value $reason
  $failed|ConvertTo-Json|Set-Content -LiteralPath "$base.json"
  Set-Content -LiteralPath "$base.txt" -Value "ABORTADO log=$base.log"
 }
 exit 1
}
$stamp=if($config.visual_utc -cmatch '\A\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\z'){$config.visual_utc -replace '[-:]',''}else{$actualConfig.Substring(0,16)}
$base=Join-Path $config.output "RESULTADO-CITA-$stamp"
# CreateNew bloquea un segundo lanzamiento, incluso si el anterior se interrumpió.
$claim=[IO.File]::Open("$base.lock",[IO.FileMode]::CreateNew)
$claim.Dispose()
$dry=$config.modo -ceq 'ensayo'
$pwsh=Join-Path $PSHOME 'pwsh.exe'
$result=[ordered]@{
 status='ABORTADO'; reason=$null; utc=[DateTimeOffset]::UtcNow.ToString('o')
 preflight_utc=$config.preflight_utc; visual_utc=$config.visual_utc; limit_utc=$null; mode=$config.modo
 preflight_exit=$null; tanda_exit=$null; python_version=$null
 source_sha=$config.source_sha; zip_expected=$config.zip_sha256; zip_actual=$null
 preflight_sha256=$config.preflight_sha256; manifest_sha256=$null; tanda_sha256=$null; config_sha256=$actualConfig.ToLowerInvariant()
 log="$base.log"
}
$exitCode=1
try{
 Set-Content -LiteralPath $result.log -Value "Inicio UTC $($result.utc)"
 if($config.modo -cnotin @('real','ensayo')){throw 'Modo de cita inválido; no ejecutar'}
 if($dry){
  if($env:VANTARE_SIN_GRAFICOS -ne '1'){throw 'Cita en modo ensayo requiere VANTARE_SIN_GRAFICOS=1'}
  Add-Content -LiteralPath $result.log 'Modo ensayo: sin cita real'
 }
 $from=Read-CitaUtc $config.preflight_utc
 $start=Read-CitaUtc $config.visual_utc
 if($from -ge $start -or ($start-$from).TotalMinutes -gt 5){throw 'Ventana de preflight inválida'}
 $end=$start.AddMinutes(72)
 $result.limit_utc=$end.ToString('o')
 if($config.source_sha -cnotmatch '\A[a-f0-9]{40}\z' -or $config.zip_sha256 -cnotmatch '\A[a-f0-9]{64}\z' -or
    $config.preflight_sha256 -cnotmatch '\A[a-f0-9]{64}\z'){throw 'Hashes de cita inválidos'}
 foreach($pair in @(@($PSCommandPath,$config.launcher_sha256),@((Join-Path $PSScriptRoot 'TAREA-CITA.ps1'),$config.task_sha256))){
  Assert-CitaPlainPath $pair[0]
  if($pair[1] -cnotmatch '\A[a-f0-9]{64}\z' -or (Get-FileHash -LiteralPath $pair[0]).Hash -ine $pair[1]){throw 'SHA-256 del lanzador o definición distinto'}
 }
 Assert-CitaNotCancelled
 if([DateTimeOffset]::UtcNow -lt $from -or [DateTimeOffset]::UtcNow -ge $start){throw 'Fuera de la ventana de preflight'}
 foreach($path in @($config.preflight,$config.zip,$config.kit)){Assert-CitaPlainPath $path}
 if([IO.Path]::GetFileName($config.preflight) -cnotmatch '\APREFLIGHT-VISUAL-[A-Z0-9]+-v2\.ps1\z'){throw 'Se requiere preflight visual v2'}
 Assert-CitaKit $config
 $tanda=Join-Path $config.kit 'TANDA.ps1'
 if((Get-FileHash -LiteralPath $tanda -Algorithm SHA256).Hash -ine $result.tanda_sha256){throw 'SHA-256 de TANDA distinto'}
 if(-not $dry){
  $null=& $tanda -Modo Servidor -SoloVisual -CitaProgramada -ValidarEnlace -Kit $config.kit -PythonExe 'C:/Python311/python.exe' -NoAntesUtc $config.visual_utc -LimiteUtc $end.ToString("yyyy-MM-ddTHH:mm:ss'Z'") -DestinoServidor $config.output
 }
 Assert-CitaNotCancelled
 if([DateTimeOffset]::UtcNow -ge $start){throw 'Se agotó la ventana antes del preflight'}
 if((Get-FileHash -LiteralPath $config.preflight -Algorithm SHA256).Hash -ine $config.preflight_sha256){throw 'SHA-256 del preflight distinto'}
 $probe=@(& $pwsh -NoProfile -NonInteractive -File $config.preflight -OkFinal 2>&1)
 $result.preflight_exit=$LASTEXITCODE
 Add-Content -LiteralPath $result.log -Value ($probe|Out-String)
 if($result.preflight_exit -ne 0){throw 'Preflight rechazado'}
 $receipt=($probe -join [Environment]::NewLine)|ConvertFrom-Json -AsHashtable
 if($receipt.source_sha -cne $config.source_sha -or $receipt.zip_sha256 -cne $config.zip_sha256 -or
    [IO.Path]::GetFullPath($receipt.kit) -ine [IO.Path]::GetFullPath($config.kit) -or
    $receipt.python_exe -notmatch '\A[A-Za-z]:[/\\][A-Za-z0-9_ .\\/()-]+\.exe\z' -or
    $receipt.python_version -notmatch '\A[0-9]+\.[0-9]+\.[0-9]+\z' -or [version]$receipt.python_version -lt [version]'3.11.0'){
  throw 'Recibo de preflight no corresponde a la cita'
 }
 $result.python_version=$receipt.python_version
 while([DateTimeOffset]::UtcNow -lt $start){
  Assert-CitaNotCancelled
  Start-Sleep -Milliseconds 250
 }
 Assert-CitaNotCancelled
 if([DateTimeOffset]::UtcNow -ge $end){throw 'Fuera de la ventana visual'}
 $mode=if($dry){'Ensayo'}else{'Servidor'}
 $tandaArgs=@('-Modo',$mode,'-SoloVisual','-Kit',$config.kit,'-PythonExe',$receipt.python_exe)
 if($dry){
  $tandaArgs+=@('-Salida',(Join-Path $config.output 'ensayo'))
 }else{
  $tandaArgs+=@('-CitaProgramada','-NoAntesUtc',$config.visual_utc,'-LimiteUtc',$end.ToString("yyyy-MM-ddTHH:mm:ss'Z'"),'-DestinoServidor',$config.output)
 }
 Assert-CitaPlainPath $tanda
 if((Get-FileHash -LiteralPath $tanda -Algorithm SHA256).Hash -ine $result.tanda_sha256){throw 'SHA-256 de TANDA distinto antes de ejecutar'}
 & $pwsh -NoProfile -NonInteractive -File $tanda @tandaArgs 2>&1 | Add-Content -LiteralPath $result.log
 $result.tanda_exit=$LASTEXITCODE
 if($result.tanda_exit -ne 0){$result.status='TANDA_FALLO';throw 'TANDA terminó con error'}
 $result.status=if($dry){'ENSAYADO'}else{'COMPLETADO'}
 $exitCode=0
}catch{
 $result.reason=$_.Exception.Message
 Add-Content -LiteralPath $result.log -Value $result.reason
}finally{
 $result.finished_utc=[DateTimeOffset]::UtcNow.ToString('o')
 $result|ConvertTo-Json|Set-Content -LiteralPath "$base.json.tmp" -Encoding utf8
 Move-Item -LiteralPath "$base.json.tmp" -Destination "$base.json"
 "$($result.status) preflight=$($result.preflight_exit) tanda=$($result.tanda_exit) $($result.reason) log=$($result.log)" |
  Set-Content -LiteralPath "$base.txt" -Encoding utf8
}
exit $exitCode

#requires -Version 7
$ErrorActionPreference='Stop'
. "$PSScriptRoot/LICENCIA_TANDA.ps1"
$oldComputer=$env:COMPUTERNAME
try {
 $env:COMPUTERNAME='SAPPHIREOS'
 $key=Get-TandaServerQaPrivatePath 'qa-aabbccdd'
 if($key -notlike 'D:\VantareServer\custodia\qa-license\*'){throw 'La privada quedó en evidencia'}
 foreach($name in 'qa-license','qa-license-cred'){
  $rejected=$false
  try{Assert-TandaCustodyPath "D:/VantareServer/evidence/overlays-rune/$name/file" $name}
  catch{$rejected=$_.Exception.Message -like 'QA_CUSTODY_PATH*'}
  if(-not $rejected){throw 'Se admitió custodia dentro de evidence'}
 }
 $env:COMPUTERNAME='TEST-PC'
 $rejected=$false
 try{$null=Get-TandaServerQaPrivatePath 'qa-aabbccdd'}catch{$rejected=$_.Exception.Message -like 'QA_KEY_NOT_APPROVED*'}
 if(-not $rejected){throw 'Ruta privada disponible fuera de SAPPHIREOS'}
}finally{$env:COMPUTERNAME=$oldComputer}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('vantare-license-flow-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $temp
try {
$script:fingerprint='a'*64
$script:bindings=$true
$script:commands=[Collections.Generic.List[string]]::new()
$script:qaRoot=Join-Path $temp 'qa-core/native'
$registry='qa-aabbccdd:'+('A'*43)
$cred=Join-Path $temp 'transfer.json'
Set-Content -LiteralPath $cred '{"key_id":"qa-aabbccdd"}'
$fakeImage=Join-Path $temp 'vantare-qa-license.exe'
Set-Content -LiteralPath $fakeImage 'FAKE NEVER EXECUTE'
$fakeHash=(Get-FileHash -LiteralPath $fakeImage).Hash.ToLowerInvariant()
$signedPath=Join-Path $temp 'signed.json'
function New-TandaCredentialTransferPath {$signedPath}
function Get-TandaServerQaPrivatePath {param($ApprovedKeyId) Join-Path $temp 'qa-license.key'}
$linked=Join-Path $temp 'link'
$null=New-Item -ItemType Junction -Path $linked -Target $temp
try{
 $rejected=$false
 try{Assert-TandaLicensePath (Join-Path $linked 'transfer.json')}catch{$rejected=$_.Exception.Message -like 'QA_LICENSE_PATH*'}
 if(-not $rejected){throw 'Se admitió un ancestro reparse'}
}finally{[IO.Directory]::Delete($linked)}

function Invoke-TandaLicenseCli {
 param($Image,$Arguments,$Environment=@{})
 $script:commands.Add($Arguments[0])
 if($Arguments[0] -ceq 'fingerprint'){return $script:fingerprint}
 if($Arguments[0] -ceq 'sign'){
  if(($Arguments -join '|') -cne "sign|--key|$(Join-Path $temp 'qa-license.key')|--fingerprint|$script:fingerprint|--out|$signedPath"){throw 'Comando de firma inválido'}
  Set-Content -LiteralPath $Arguments[-1] '{"key_id":"qa-aabbccdd"}'
  return
 }
 if($Arguments[0] -cne 'install-credential' -or $Arguments -contains '--key' -or
    $Arguments[2] -cne $cred -or $Arguments[4] -cne $script:qaRoot -or
    $Environment.VANTARE_LICENSE_PUBLIC_KEYS -cne $registry -or $Environment.ContainsKey('VANTARE_NATIVE_DATA_ROOT')){
  throw 'La instalación no recibió exclusivamente la credencial firmada y el registro público'
 }
 if($script:bindings){
  $rights=Join-Path $script:qaRoot 'Vantare/native/rights/nightly'
  $null=New-Item -ItemType Directory -Path $rights -Force
  Set-Content -LiteralPath (Join-Path $rights 'binding.dpapi') 'FAKE QA BINDING'
 }
}

if((Get-TandaQaFingerprint 'fake-cli.exe') -cne $script:fingerprint){throw 'No se conservó la huella'}
$envQa=Install-TandaQaCredential 'fake-cli.exe' $cred $registry 'qa-aabbccdd' (Join-Path $temp 'qa-core')
if($envQa.VANTARE_NATIVE_DATA_ROOT -cne $script:qaRoot -or $envQa.LOCALAPPDATA -eq $env:LOCALAPPDATA -or $envQa.APPDATA -eq $env:APPDATA -or ($script:commands -join ',') -cne 'fingerprint,install-credential'){
 throw 'Entorno QA o secuencia incorrectos'
}
$script:bindings=$false
$script:qaRoot=Join-Path $temp 'missing/native'
$rejected=$false
try{ $null=Install-TandaQaCredential 'fake-cli.exe' $cred $registry 'qa-aabbccdd' (Join-Path $temp 'missing') }
catch{ $rejected=$_.Exception.Message -like 'QA_BINDING_MISSING*' }
if(-not $rejected){throw 'El éxito del CLI sin binding QA habilitó la ronda'}
$script:commands.Clear()
$rejected=$false
try{ $null=Install-TandaQaCredential 'fake-cli.exe' $cred $registry 'qa-eeff0011' (Join-Path $temp 'other') }
catch{ $rejected=$_.Exception.Message -like 'QA_KEY_NOT_APPROVED*' }
if(-not $rejected -or $script:commands.Count){throw 'Se lanzó el CLI con otra clave'}
$candidate=New-TandaSignedCredential $fakeImage $script:fingerprint 'qa-aabbccdd' $fakeHash
if($candidate -cne $signedPath -or ($script:commands -join ',') -cne 'sign'){throw 'Firma fuera del contrato'}
$script:commands.Clear()
$rejected=$false
try{$null=New-TandaSignedCredential $fakeImage $script:fingerprint 'qa-aabbccdd' ('0'*64)}
catch{$rejected=$_.Exception.Message -like 'QA_SIGN_CLI_UNVERIFIED*'}
if(-not $rejected -or $script:commands.Count){throw 'CLI sin hash aprobado recibió la orden'}
'PASS: huella, firma, custodia, reparse y binding requerido solo en QA'
}finally{
 $tempPath=[IO.Path]::GetFullPath($temp)
 $tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
 if([IO.Path]::GetDirectoryName($tempPath) -ine $tempRoot -or
    [IO.Path]::GetFileName($tempPath) -cnotmatch '\Avantare-license-flow-[0-9a-f]{32}\z'){
  throw 'El temporal de prueba no pertenece al ensayo'
 }
 Assert-TandaLicensePath $tempPath
 Remove-Item -LiteralPath $tempPath -Recurse -Force
}

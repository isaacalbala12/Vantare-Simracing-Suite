$ErrorActionPreference='Stop'
. "$PSScriptRoot/LICENCIA_TANDA.ps1"
$temp=Join-Path ([IO.Path]::GetTempPath()) ('vantare-license-flow-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $temp
$script:fingerprint='a'*64
$script:bindings=$true
$script:commands=[Collections.Generic.List[string]]::new()
$script:qaRoot=Join-Path $temp 'qa-core/native'
$registry='qa-aabbccdd:'+('A'*43)
$cred=Join-Path $temp 'transfer.json'
Set-Content -LiteralPath $cred '{"key_id":"qa-aabbccdd"}'

function Invoke-TandaLicenseCli {
 param($Image,$Arguments,$Environment=@{})
 $script:commands.Add($Arguments[0])
 if($Arguments[0] -ceq 'fingerprint'){return $script:fingerprint}
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
'PASS: huella, credencial firmada, binding requerido solo en QA y key_id aprobado'

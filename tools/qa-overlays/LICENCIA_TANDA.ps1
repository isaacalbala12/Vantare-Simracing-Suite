# Credential commands capture output in memory. Paths/credentials are excluded from evidence.
function Invoke-TandaLicenseCli([string]$Image,[string[]]$Arguments,[hashtable]$Environment=@{}){
 $info=[Diagnostics.ProcessStartInfo]::new($Image)
 $info.UseShellExecute=$false
 $info.CreateNoWindow=$true
 $info.RedirectStandardOutput=$true
 $info.RedirectStandardError=$true
 foreach($argument in $Arguments){$info.ArgumentList.Add($argument)}
 foreach($key in $Environment.Keys){$info.Environment[$key]=[string]$Environment[$key]}
 $process=[Diagnostics.Process]::Start($info)
 try{
  $stdout=$process.StandardOutput.ReadToEndAsync()
  $stderr=$process.StandardError.ReadToEndAsync()
  if(-not $process.WaitForExit(20000)){
   $process.Kill($true)
   $process.WaitForExit()
   throw 'QA_LICENSE_CLI_TIMEOUT'
  }
  $null=$stderr.GetAwaiter().GetResult()
  if($process.ExitCode -ne 0){throw "QA_LICENSE_CLI_FAILED: $($Arguments[0]) ($($process.ExitCode))"}
  $stdout.GetAwaiter().GetResult().Trim()
 }finally{$process.Dispose()}
}
function Get-TandaQaFingerprint([string]$Image){
 $fingerprint=Invoke-TandaLicenseCli $Image @('fingerprint')
 if($fingerprint -cnotmatch '\A[0-9a-f]{64}\z'){throw 'QA_FINGERPRINT_INVALID'}
 $fingerprint
}
function Assert-TandaLicensePath([string]$Path){
 if(-not [IO.Path]::IsPathFullyQualified($Path) -or $Path -notmatch '\A[A-Za-z]:[/\\]'){throw 'QA_LICENSE_PATH: se requiere unidad local'}
 for($entry=[IO.Path]::GetFullPath($Path);$entry;$entry=[IO.Path]::GetDirectoryName($entry)){
  if((Test-Path -LiteralPath $entry) -and ((Get-Item -LiteralPath $entry -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){
   throw 'QA_LICENSE_PATH: enlace o reparse point'
  }
 }
}
function Assert-TandaApprovedRegistry([string]$Registry,[string]$ApprovedKeyId){
 if($ApprovedKeyId -cnotmatch '\Aqa-[0-9a-f]{8}\z' -or $Registry -cnotmatch ('\A'+[regex]::Escape($ApprovedKeyId)+':[A-Za-z0-9_-]{43}\z')){
  throw 'QA_KEY_NOT_APPROVED: el registro público debe corresponder al key_id aprobado'
 }
}
function Assert-TandaTransferKey([string]$Credential,[string]$ApprovedKeyId){
 Assert-TandaLicensePath $Credential
 if(-not(Test-Path -LiteralPath $Credential -PathType Leaf) -or (Get-Item -LiteralPath $Credential).Length -gt 32KB){
  throw 'QA_TRANSFER_INVALID: falta la credencial firmada o excede su límite'
 }
 try{$payload=Get-Content -LiteralPath $Credential -Raw | ConvertFrom-Json -AsHashtable}
 catch{throw 'QA_TRANSFER_INVALID: JSON inválido'}
 if($payload['key_id'] -cne $ApprovedKeyId){throw 'QA_KEY_NOT_APPROVED: la credencial corresponde a otra clave'}
}
function Get-TandaServerQaPrivatePath([string]$ApprovedKeyId){
 if($env:COMPUTERNAME -ine 'SAPPHIREOS' -or $ApprovedKeyId -cnotmatch '\Aqa-[0-9a-f]{8}\z'){
  throw 'QA_KEY_NOT_APPROVED: la clave QA solo se usa en el servidor con el key_id aprobado'
 }
 Join-Path 'D:/VantareServer/evidence/overlays-rune/qa-license' "$ApprovedKeyId/qa-license.key"
}
function New-TandaSignedCredential([string]$Image,[string]$Fingerprint,[string]$ApprovedKeyId){
 if($Fingerprint -cnotmatch '\A[0-9a-f]{64}\z'){throw 'QA_FINGERPRINT_INVALID'}
 $key=Get-TandaServerQaPrivatePath $ApprovedKeyId
 $base='D:/VantareServer/evidence/overlays-rune'
 $transfer=Join-Path $base ('qa-license-cred/'+[guid]::NewGuid().ToString('N')+'.json')
 Assert-TandaLicensePath $key
 Assert-TandaLicensePath $transfer
 $null=New-Item -ItemType Directory -Path (Split-Path $transfer -Parent) -Force
 # The CLI also rejects Git directories, real roots and existing output files.
 $null=Invoke-TandaLicenseCli $Image @('sign','--key',$key,'--fingerprint',$Fingerprint,'--out',$transfer)
 Assert-TandaTransferKey $transfer $ApprovedKeyId
 $transfer
}
function Install-TandaQaCredential([string]$Image,[string]$Credential,[string]$Registry,[string]$ApprovedKeyId,[string]$Directory){
 Assert-TandaApprovedRegistry $Registry $ApprovedKeyId
 Assert-TandaTransferKey $Credential $ApprovedKeyId
 Assert-TandaLicensePath $Directory
 if(Test-Path -LiteralPath $Directory){throw 'QA_PROFILE_EXISTS: se exige un perfil nuevo'}
 $native=Join-Path $Directory 'native'
 $null=New-Item -ItemType Directory -Path $Directory
 # Leave the actual environment visible to the CLI's path guard, without
 # assigning any real root to our core. The CLI verifies signature and device.
 $null=Invoke-TandaLicenseCli $Image @('install-credential','--credential',$Credential,'--qa-root',$native) @{
  VANTARE_LICENSE_PUBLIC_KEYS=$Registry
 }
 $binding=Join-Path $native 'Vantare/native/rights/nightly/binding.dpapi'
 Assert-TandaLicensePath $binding
 if(-not(Test-Path -LiteralPath $binding -PathType Leaf) -or (Get-Item -LiteralPath $binding).Length -le 0){
  throw 'QA_BINDING_MISSING: no arrancar el núcleo sin binding en el perfil QA'
 }
 $local=Join-Path $Directory 'local'
 $roaming=Join-Path $Directory 'roaming'
 $null=New-Item -ItemType Directory -Path $local,$roaming
 @{VANTARE_NATIVE_DATA_ROOT=$native;LOCALAPPDATA=$local;APPDATA=$roaming}
}

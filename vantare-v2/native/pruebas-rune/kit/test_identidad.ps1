$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'PROCESOS.ps1')
$directory=Join-Path ([IO.Path]::GetTempPath()) ('vanta141-identidad-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory $directory
$path=Join-Path $directory 'raiz.json'
$process=[Diagnostics.Process]::GetCurrentProcess()
try {
 $child=[pscustomobject]@{Process=$process;CreatedUtc=$process.StartTime.ToUniversalTime().ToString('o')
  StartQpc=[Diagnostics.Stopwatch]::GetTimestamp();Binary=$process.MainModule.FileName}
 Write-VantareRootIdentity -Child $child -Sha256 ('a'*64) -Path $path
 $identity=Get-Content $path -Raw|ConvertFrom-Json
 if($identity.process_id -ne $PID -or $identity.start_qpc -ne $child.StartQpc){throw 'Identidad JSON incorrecta.'}
 $hash=(Get-FileHash $path).Hash
 $failed=$false
 try{Write-VantareRootIdentity -Child $child -Sha256 ('b'*64) -Path $path}catch{$failed=$true}
 if(-not $failed -or (Get-FileHash $path).Hash -ne $hash){throw 'Se sobrescribió la identidad.'}
 'PASS: identidad UTF-8 nueva y rechazo de sobrescritura; solo el proceso PowerShell actual.'
}finally{
 $process.Dispose()
 if(Test-Path $path){Remove-Item -LiteralPath $path}
 Remove-Item -LiteralPath $directory
}
